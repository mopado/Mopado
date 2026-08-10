"""Tests for iteration 13 - Admin families listing + DELETE account + backend endpoints."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://mopado-family-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def registered_test_user(api_client):
    """Create a fresh test user, yield the user object, then attempt to delete it."""
    email = f"TEST_delete_{uuid.uuid4().hex[:8]}@mopado.fr"
    payload = {
        "email": email,
        "password": "test123",
        "family_name": f"TEST_Fam_{uuid.uuid4().hex[:6]}",
        "nb_children": 2,
        "children_ages": [7, 10],
    }
    r = api_client.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    user = data["user"]
    user["_email"] = email
    yield user
    # cleanup
    try:
        api_client.delete(f"{API}/family/{user['id']}")
    except Exception:
        pass


# =============== GET /api/admin/families ===============
class TestAdminFamilies:
    def test_admin_families_returns_list(self, api_client, registered_test_user):
        r = api_client.get(f"{API}/admin/families")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_admin_families_schema(self, api_client, registered_test_user):
        r = api_client.get(f"{API}/admin/families")
        assert r.status_code == 200
        data = r.json()
        found = next((u for u in data if u.get("id") == registered_test_user["id"]), None)
        assert found is not None, "Newly registered user not found in /admin/families"
        expected_keys = {
            "id", "email", "family_name", "nb_children", "children_ages",
            "mopado_dollars", "badges_count", "completed_count", "created_at",
        }
        assert expected_keys.issubset(set(found.keys())), f"Missing keys: {expected_keys - set(found.keys())}"
        assert found["email"] == registered_test_user["_email"]
        assert found["nb_children"] == 2
        assert found["children_ages"] == [7, 10]
        assert isinstance(found["badges_count"], int)
        assert isinstance(found["completed_count"], int)
        assert isinstance(found["mopado_dollars"], int)
        assert found["created_at"] is not None

    def test_admin_families_no_mongo_id(self, api_client, registered_test_user):
        r = api_client.get(f"{API}/admin/families")
        data = r.json()
        for u in data:
            assert "_id" not in u, "MongoDB _id leaked in /admin/families"


# =============== DELETE /api/family/{id} ===============
class TestDeleteFamily:
    def test_delete_family_removes_user(self, api_client):
        # Register
        email = f"TEST_delete_{uuid.uuid4().hex[:8]}@mopado.fr"
        r = api_client.post(f"{API}/auth/register", json={
            "email": email, "password": "test123",
            "family_name": "TEST_ToDelete", "nb_children": 1, "children_ages": [8]
        })
        assert r.status_code == 200
        user_id = r.json()["user"]["id"]

        # Confirm listed
        r = api_client.get(f"{API}/admin/families")
        assert any(u["id"] == user_id for u in r.json())

        # Delete
        d = api_client.delete(f"{API}/family/{user_id}")
        assert d.status_code == 200, d.text
        assert "deleted" in d.json().get("message", "").lower()

        # Confirm gone from families list
        r2 = api_client.get(f"{API}/admin/families")
        assert not any(u["id"] == user_id for u in r2.json()), "User still present after DELETE"

        # GET /family/{id} should 404
        g = api_client.get(f"{API}/family/{user_id}")
        assert g.status_code in (400, 404), f"Expected 404/400 after delete, got {g.status_code}"

    def test_delete_family_removes_sessions(self, api_client):
        # Register user
        email = f"TEST_delete_sess_{uuid.uuid4().hex[:8]}@mopado.fr"
        r = api_client.post(f"{API}/auth/register", json={
            "email": email, "password": "test123",
            "family_name": "TEST_SessDel", "nb_children": 1, "children_ages": [8]
        })
        assert r.status_code == 200
        user_id = r.json()["user"]["id"]

        # Get any episode
        seasons = api_client.get(f"{API}/seasons").json()
        session_created = False
        if seasons:
            eps = api_client.get(f"{API}/episodes/season/{seasons[0]['id']}").json()
            if eps:
                s = api_client.post(f"{API}/sessions/start", json={
                    "family_id": user_id,
                    "episode_id": eps[0]["id"],
                    "season_id": seasons[0]["id"],
                })
                assert s.status_code == 200
                session_created = True

        if session_created:
            sessions_before = api_client.get(f"{API}/sessions/family/{user_id}").json()
            assert len(sessions_before) >= 1

        # Delete account
        d = api_client.delete(f"{API}/family/{user_id}")
        assert d.status_code == 200

        # Sessions should be empty
        sessions_after = api_client.get(f"{API}/sessions/family/{user_id}").json()
        assert sessions_after == [], f"Sessions not cleaned up: {sessions_after}"

    def test_delete_family_invalid_id_returns_error(self, api_client):
        r = api_client.delete(f"{API}/family/not-a-valid-object-id")
        assert r.status_code in (400, 404), f"Expected 400/404 for invalid id, got {r.status_code}"

    def test_delete_family_nonexistent_returns_404(self, api_client):
        # valid ObjectId shape but non-existent
        r = api_client.delete(f"{API}/family/507f1f77bcf86cd799439011")
        assert r.status_code == 404, f"Expected 404 for nonexistent user, got {r.status_code}: {r.text}"


# =============== Session double-tap safety at API level ===============
class TestSessionDoubleComplete:
    def test_complete_session_twice_only_one_reward(self, api_client):
        # Register fresh user
        email = f"TEST_dblcompl_{uuid.uuid4().hex[:8]}@mopado.fr"
        r = api_client.post(f"{API}/auth/register", json={
            "email": email, "password": "test123",
            "family_name": "TEST_DblCompl", "nb_children": 1, "children_ages": [8]
        })
        assert r.status_code == 200
        user_id = r.json()["user"]["id"]

        try:
            # Pick a season+episode
            seasons = api_client.get(f"{API}/seasons").json()
            if not seasons:
                pytest.skip("No seasons available")
            eps = api_client.get(f"{API}/episodes/season/{seasons[0]['id']}").json()
            if not eps:
                pytest.skip("No episodes")
            episode = eps[0]
            reward = int(episode.get("mopado_reward", 5))

            # Start session
            s = api_client.post(f"{API}/sessions/start", json={
                "family_id": user_id,
                "episode_id": episode["id"],
                "season_id": seasons[0]["id"],
            })
            assert s.status_code == 200
            session_id = s.json()["session_id"]

            # Complete twice
            r1 = api_client.put(f"{API}/sessions/{session_id}/complete", json={"closing_word": "Merveilleux"})
            r2 = api_client.put(f"{API}/sessions/{session_id}/complete", json={"closing_word": "Merveilleux"})
            assert r1.status_code == 200
            assert r2.status_code == 200

            body1 = r1.json()
            body2 = r2.json()

            # First should give reward, second should say already_completed
            assert body1.get("already_completed") is False, f"First completion flagged already: {body1}"
            assert body1.get("mopado_earned") == reward
            assert body2.get("already_completed") is True, f"Second completion not flagged already: {body2}"
            assert body2.get("mopado_earned") == 0

            # User balance should equal reward only once
            u = api_client.get(f"{API}/family/{user_id}").json()
            assert u.get("mopado_dollars") == reward, f"Expected {reward}, got {u.get('mopado_dollars')}"
        finally:
            api_client.delete(f"{API}/family/{user_id}")


# =============== Progress endpoint used by family-wall ===============
class TestProgressEndpoint:
    def test_progress_for_new_user(self, api_client, registered_test_user):
        r = api_client.get(f"{API}/progress/{registered_test_user['id']}")
        assert r.status_code == 200
        data = r.json()
        for k in ("mopado_dollars", "badges", "completed_episodes", "closing_words_history", "total_sessions"):
            assert k in data
        assert data["mopado_dollars"] == 0
        assert data["badges"] == []
        assert data["completed_episodes"] == []
        assert data["closing_words_history"] == []
        assert data["total_sessions"] == 0


# =============== Login for the well-known test account ===============
class TestKnownAccount:
    def test_login_famille_test(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={
            "email": "famille.test@mopado.fr",
            "password": "test123"
        })
        assert r.status_code == 200, f"Login failed: {r.text}"
        assert "token" in r.json()
        assert "user" in r.json()
        assert r.json()["user"]["email"] == "famille.test@mopado.fr"


# =============== Admin panel HTML has Familles tab ===============
class TestAdminHTMLTab:
    def test_admin_panel_html_reachable(self, api_client):
        r = api_client.get(f"{API}/admin-panel")
        assert r.status_code == 200
        assert "html" in r.headers.get("content-type", "").lower()

    def test_admin_panel_has_familles_tab(self, api_client):
        r = api_client.get(f"{API}/admin-panel")
        html = r.text
        assert "Familles" in html, "Familles tab not found in admin.html"
        assert "/api/admin/families" in html or "admin/families" in html, "families endpoint not wired in admin.html"
