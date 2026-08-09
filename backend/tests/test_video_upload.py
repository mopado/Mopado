"""
Backend tests for Mopado video upload fix.
Tests: POST /api/upload/video, GET /api/videos/{filename}, DELETE /api/videos/{filename}
       Episode CRUD with video_filename field
       Admin panel HTML serving
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mopado-family-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEASON_ID = "6a78e7a45f87998d7ed8e2c3"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def state():
    # Shared across tests
    return {}


# ---------- Video upload ----------
class TestVideoUpload:

    def test_upload_valid_mp4(self, api_client, state):
        # Small MP4-like payload (contents don't matter, only content_type)
        content = b"\x00\x00\x00\x18ftypmp42" + os.urandom(1024 * 100)  # ~100KB
        files = {"file": ("TEST_video.mp4", io.BytesIO(content), "video/mp4")}
        r = api_client.post(f"{API}/upload/video", files=files, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "filename" in data and data["filename"].endswith(".mp4")
        assert "size_mb" in data and isinstance(data["size_mb"], (int, float))
        assert data["size_mb"] > 0
        state["mp4_filename"] = data["filename"]

    def test_upload_valid_webm(self, api_client, state):
        content = os.urandom(1024 * 50)
        files = {"file": ("TEST_video.webm", io.BytesIO(content), "video/webm")}
        r = api_client.post(f"{API}/upload/video", files=files, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "filename" in data
        # Extension preserved
        assert data["filename"].endswith(".webm")
        state["webm_filename"] = data["filename"]

    def test_upload_invalid_txt_rejected(self, api_client):
        files = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
        r = api_client.post(f"{API}/upload/video", files=files, timeout=30)
        assert r.status_code == 400, r.text
        assert "Type de fichier non supporté" in r.json().get("detail", "")


# ---------- Streaming ----------
class TestVideoStreaming:

    def test_stream_existing_video(self, api_client, state):
        filename = state.get("mp4_filename")
        assert filename, "Upload test must run first"
        r = api_client.get(f"{API}/videos/{filename}", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("video/mp4")
        assert len(r.content) > 0

    def test_stream_nonexistent_video(self, api_client):
        r = api_client.get(f"{API}/videos/nonexistent-file-xyz.mp4", timeout=30)
        assert r.status_code == 404


# ---------- Episode CRUD with video_filename ----------
class TestEpisodeVideoIntegration:

    def test_create_episode_with_video(self, api_client, state):
        filename = state.get("mp4_filename")
        assert filename
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_Episode with video",
            "description": "Test description",
            "video_filename": filename,
            "order": 999,
            "cards": [{"type": "question", "content": "Q?"}],
            "mopado_reward": 5,
        }
        r = api_client.post(f"{API}/episodes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        state["episode_with_video_id"] = data["id"]

    def test_get_episode_returns_video_filename_field(self, api_client, state):
        eid = state.get("episode_with_video_id")
        assert eid
        r = api_client.get(f"{API}/episodes/{eid}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "video_filename" in data
        assert data["video_filename"] == state["mp4_filename"]
        # Ensure old field is not present
        assert "video_base64" not in data

    def test_create_episode_without_video(self, api_client, state):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_Episode no video",
            "description": "No video test",
            "video_filename": None,
            "order": 998,
            "cards": [],
            "mopado_reward": 5,
        }
        r = api_client.post(f"{API}/episodes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        state["episode_no_video_id"] = eid
        # Verify persisted
        r2 = api_client.get(f"{API}/episodes/{eid}", timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("video_filename") is None

    def test_delete_episode_removes_video_file(self, api_client, state):
        eid = state.get("episode_with_video_id")
        filename = state.get("mp4_filename")
        assert eid and filename

        # Confirm video is currently streamable
        r_before = api_client.get(f"{API}/videos/{filename}", timeout=30)
        assert r_before.status_code == 200

        # Delete episode
        r = api_client.delete(f"{API}/episodes/{eid}", timeout=30)
        assert r.status_code == 200

        # Video file should now be gone
        r_after = api_client.get(f"{API}/videos/{filename}", timeout=30)
        assert r_after.status_code == 404, "Video file should be deleted with episode"

    def test_cleanup_no_video_episode(self, api_client, state):
        eid = state.get("episode_no_video_id")
        if eid:
            api_client.delete(f"{API}/episodes/{eid}", timeout=30)


# ---------- Video DELETE cleanup for remaining files ----------
class TestVideoDelete:

    def test_delete_webm_video(self, api_client, state):
        filename = state.get("webm_filename")
        if not filename:
            pytest.skip("No webm file uploaded")
        r = api_client.delete(f"{API}/videos/{filename}", timeout=30)
        assert r.status_code == 200
        # Second delete -> 404
        r2 = api_client.delete(f"{API}/videos/{filename}", timeout=30)
        assert r2.status_code == 404


# ---------- Admin panel ----------
class TestAdminPanel:

    def test_admin_panel_html_loads(self, api_client):
        r = api_client.get(f"{API}/admin-panel", timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        # According to test spec, admin should reference 500MB size limit
        body = r.text
        assert "500" in body, "Admin panel should mention 500MB size limit"

    def test_admin_panel_mentions_size_limit_500mb(self, api_client):
        r = api_client.get(f"{API}/admin-panel", timeout=30)
        assert r.status_code == 200
        body = r.text.lower()
        # Look for 500 mb or 500mb string
        assert ("500 mb" in body) or ("500mb" in body) or ("500 mo" in body) or ("500mo" in body), \
            "Admin should show updated 500MB limit"
