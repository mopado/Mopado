"""
Backend tests for Mopado CHUNKED video upload feature.
Endpoints tested:
  - POST /api/upload/video/init
  - POST /api/upload/video/chunk?upload_id=X&chunk_index=Y
  - POST /api/upload/video/complete?upload_id=X
  - GET  /api/videos/{filename}
  - POST /api/episodes (with video_filename from chunked upload)
  - POST /api/upload/video           (legacy single-shot, backward-compat)
  - GET  /api/admin-panel            (must contain chunked-upload JS)
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mopado-family-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SEASON_ID = "6a78e7a45f87998d7ed8e2c3"
CHUNK_SIZE = 5 * 1024 * 1024  # 5 MB


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def state():
    return {}


# ---------- TEST 1: init ----------
class TestInit:

    def test_init_valid_mp4(self, api_client, state):
        params = {"filename": "TEST_chunked.mp4", "total_size": 15 * 1024 * 1024, "total_chunks": 3}
        r = api_client.post(f"{API}/upload/video/init", params=params, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "upload_id" in data and len(data["upload_id"]) >= 32
        assert data["chunk_size"] == CHUNK_SIZE
        assert "message" in data
        state["upload_id_mp4"] = data["upload_id"]

    def test_init_valid_mov(self, api_client):
        params = {"filename": "TEST_chunked.mov", "total_size": 1024, "total_chunks": 1}
        r = api_client.post(f"{API}/upload/video/init", params=params, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["chunk_size"] == CHUNK_SIZE

    def test_init_valid_webm(self, api_client):
        params = {"filename": "TEST_chunked.webm", "total_size": 1024, "total_chunks": 1}
        r = api_client.post(f"{API}/upload/video/init", params=params, timeout=30)
        assert r.status_code == 200, r.text

    def test_init_rejects_txt(self, api_client):
        params = {"filename": "TEST_bad.txt", "total_size": 100, "total_chunks": 1}
        r = api_client.post(f"{API}/upload/video/init", params=params, timeout=30)
        assert r.status_code == 400, r.text
        assert "Format non supporté" in r.json().get("detail", "")


# ---------- TEST 2 + 3 + 4: full 15MB flow (3 chunks) ----------
class TestFullChunkedFlow:

    def test_full_15mb_flow(self, api_client, state):
        # Build a 15MB deterministic payload
        total_bytes = 15 * 1024 * 1024
        payload = os.urandom(total_bytes)
        assert len(payload) == total_bytes

        # 1. init
        init_r = api_client.post(
            f"{API}/upload/video/init",
            params={"filename": "TEST_15mb.mp4", "total_size": total_bytes, "total_chunks": 3},
            timeout=30,
        )
        assert init_r.status_code == 200, init_r.text
        upload_id = init_r.json()["upload_id"]
        state["flow_upload_id"] = upload_id

        # 2. upload 3 chunks
        for i in range(3):
            start = i * CHUNK_SIZE
            end = min(start + CHUNK_SIZE, total_bytes)
            chunk_bytes = payload[start:end]
            files = {"chunk": (f"chunk_{i}", io.BytesIO(chunk_bytes), "application/octet-stream")}
            r = api_client.post(
                f"{API}/upload/video/chunk",
                params={"upload_id": upload_id, "chunk_index": i},
                files=files,
                timeout=120,
            )
            assert r.status_code == 200, f"chunk {i} failed: {r.text}"
            data = r.json()
            assert data["chunk_index"] == i
            assert data["received_chunks"] == i + 1
            assert data["total_chunks"] == 3
            assert 0 < data["progress"] <= 100
            expected_progress = round(((i + 1) / 3) * 100, 1)
            assert data["progress"] == expected_progress

        # 3. complete
        c_r = api_client.post(
            f"{API}/upload/video/complete",
            params={"upload_id": upload_id},
            timeout=30,
        )
        assert c_r.status_code == 200, c_r.text
        cdata = c_r.json()
        assert "filename" in cdata and cdata["filename"].endswith(".mp4")
        assert "size_mb" in cdata
        # 15 MB payload → size_mb ~= 15.0
        assert 14.9 <= cdata["size_mb"] <= 15.1, f"Expected ~15MB got {cdata['size_mb']}"
        state["assembled_filename"] = cdata["filename"]

    def test_assembled_video_streamable(self, api_client, state):
        filename = state.get("assembled_filename")
        assert filename
        r = api_client.get(f"{API}/videos/{filename}", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("video/mp4")
        # Content length should be ~15MB
        content_len = len(r.content)
        assert 14.9 * 1024 * 1024 <= content_len <= 15.1 * 1024 * 1024, \
            f"Assembled file size mismatch: {content_len} bytes"


# ---------- TEST 5: Error handling ----------
class TestErrors:

    def test_chunk_with_invalid_upload_id(self, api_client):
        files = {"chunk": ("x", io.BytesIO(b"abc"), "application/octet-stream")}
        r = api_client.post(
            f"{API}/upload/video/chunk",
            params={"upload_id": "nonexistent-id-xyz", "chunk_index": 0},
            files=files,
            timeout=30,
        )
        assert r.status_code == 404, r.text
        assert "non trouvée" in r.json().get("detail", "").lower() or \
               "non trouv" in r.json().get("detail", "").lower()

    def test_complete_with_invalid_upload_id(self, api_client):
        r = api_client.post(
            f"{API}/upload/video/complete",
            params={"upload_id": "nonexistent-id-xyz"},
            timeout=30,
        )
        assert r.status_code == 404, r.text


# ---------- TEST 6: Episode created with chunked-uploaded video ----------
class TestEpisodeWithChunkedVideo:

    def test_create_episode_and_stream(self, api_client, state):
        filename = state.get("assembled_filename")
        assert filename, "Full-flow test must run first"

        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_Chunked Episode",
            "description": "Episode using chunked-uploaded video",
            "video_filename": filename,
            "order": 997,
            "cards": [{"type": "question", "content": "Q?"}],
            "mopado_reward": 5,
        }
        r = api_client.post(f"{API}/episodes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        state["chunked_episode_id"] = eid

        # verify GET
        g = api_client.get(f"{API}/episodes/{eid}", timeout=30)
        assert g.status_code == 200
        assert g.json().get("video_filename") == filename

        # Stream video
        v = api_client.get(f"{API}/videos/{filename}", timeout=60)
        assert v.status_code == 200
        assert len(v.content) > 0

    def test_cleanup_chunked_episode(self, api_client, state):
        eid = state.get("chunked_episode_id")
        if eid:
            r = api_client.delete(f"{API}/episodes/{eid}", timeout=30)
            assert r.status_code == 200
            # video file should also be deleted
            filename = state.get("assembled_filename")
            v = api_client.get(f"{API}/videos/{filename}", timeout=30)
            assert v.status_code == 404


# ---------- TEST 7: Legacy single-shot upload ----------
class TestLegacyUpload:

    def test_legacy_single_shot_still_works(self, api_client, state):
        content = b"\x00\x00\x00\x18ftypmp42" + os.urandom(1024 * 100)  # ~100KB
        files = {"file": ("TEST_legacy.mp4", io.BytesIO(content), "video/mp4")}
        r = api_client.post(f"{API}/upload/video", files=files, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["filename"].endswith(".mp4")
        assert data["size_mb"] > 0
        state["legacy_filename"] = data["filename"]

    def test_cleanup_legacy_video(self, api_client, state):
        filename = state.get("legacy_filename")
        if filename:
            r = api_client.delete(f"{API}/videos/{filename}", timeout=30)
            assert r.status_code == 200


# ---------- TEST 8: Admin panel contains chunked-upload JS ----------
class TestAdminPanelChunkedJS:

    def test_admin_panel_html_loads(self, api_client):
        r = api_client.get(f"{API}/admin-panel", timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")

    def test_admin_panel_references_chunked_upload(self, api_client):
        r = api_client.get(f"{API}/admin-panel", timeout=30)
        assert r.status_code == 200
        body = r.text
        assert "upload_id" in body, "Admin panel missing 'upload_id' reference"
        assert "CHUNK_SIZE" in body, "Admin panel missing 'CHUNK_SIZE' constant"
        assert "total_chunks" in body, "Admin panel missing 'total_chunks' reference"
