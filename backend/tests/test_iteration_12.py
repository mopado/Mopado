"""
Iteration 12 backend tests: episode latest endpoint, cleanup on edit/delete,
registration flow.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://mopado-family-1.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def season_id():
    # Use first existing season (Saison test) to keep test data isolated in a temp season
    r = requests.post(f"{API}/seasons", json={"name": f"TEST_SEASON_{uuid.uuid4().hex[:6]}",
                                              "description": "Temp season for iteration_12 tests",
                                              "order": 999})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    yield sid
    requests.delete(f"{API}/seasons/{sid}")


# ---------- Registration ----------
class TestRegistration:
    def test_register_success_returns_token_and_user(self):
        email = f"TEST_reg_{uuid.uuid4().hex[:8]}@mopado.fr"
        payload = {
            "email": email,
            "password": "test123",
            "family_name": "TEST Reg",
            "nb_children": 2,
            "children_ages": [8, 12],
        }
        r = requests.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["token"]
        assert data["user"]["email"] == email
        assert data["user"]["mopado_dollars"] == 0
        assert data["user"]["completed_episodes"] == []

    def test_register_duplicate_email_returns_400(self):
        email = f"TEST_dup_{uuid.uuid4().hex[:8]}@mopado.fr"
        payload = {"email": email, "password": "test123", "family_name": "TEST",
                   "nb_children": 1, "children_ages": [10]}
        r1 = requests.post(f"{API}/auth/register", json=payload)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/register", json=payload)
        assert r2.status_code == 400
        assert "already registered" in r2.json()["detail"].lower()

    def test_register_invalid_email_returns_422(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "not-an-email", "password": "test123", "family_name": "X",
            "nb_children": 1, "children_ages": [10]
        })
        assert r.status_code == 422


# ---------- Episodes CRUD + timestamps ----------
class TestEpisodeTimestamps:
    def test_create_episode_has_created_and_updated_at(self, season_id):
        r = requests.post(f"{API}/episodes", json={
            "season_id": season_id, "title": "TEST_ep1", "description": "d",
            "order": 1, "cards": [], "mopado_reward": 5,
        })
        assert r.status_code == 200
        ep_id = r.json()["id"]
        got = requests.get(f"{API}/episodes/{ep_id}").json()
        assert "created_at" in got and got["created_at"]
        assert "updated_at" in got and got["updated_at"]
        # cleanup
        requests.delete(f"{API}/episodes/{ep_id}")

    def test_put_refreshes_updated_at(self, season_id):
        r = requests.post(f"{API}/episodes", json={
            "season_id": season_id, "title": "TEST_ep2", "description": "d",
            "order": 2, "mopado_reward": 5,
        })
        ep_id = r.json()["id"]
        before = requests.get(f"{API}/episodes/{ep_id}").json()
        time.sleep(1.1)
        r2 = requests.put(f"{API}/episodes/{ep_id}", json={
            "season_id": season_id, "title": "TEST_ep2_edited", "description": "d2",
            "order": 2, "mopado_reward": 5,
        })
        assert r2.status_code == 200
        after = requests.get(f"{API}/episodes/{ep_id}").json()
        assert after["title"] == "TEST_ep2_edited"
        assert after["updated_at"] > before["updated_at"]
        assert after["created_at"] == before["created_at"]
        requests.delete(f"{API}/episodes/{ep_id}")


# ---------- Latest endpoint ----------
class TestLatestEpisode:
    def test_latest_returns_most_recent(self, season_id):
        # Create two episodes with sleep between them
        r1 = requests.post(f"{API}/episodes", json={
            "season_id": season_id, "title": "TEST_older", "description": "d",
            "order": 1, "mopado_reward": 5})
        older_id = r1.json()["id"]
        time.sleep(1.1)
        r2 = requests.post(f"{API}/episodes", json={
            "season_id": season_id, "title": "TEST_newer", "description": "d",
            "order": 2, "mopado_reward": 5})
        newer_id = r2.json()["id"]

        latest = requests.get(f"{API}/episodes/latest/current").json()
        assert latest is not None
        assert latest["id"] == newer_id
        assert latest["title"] == "TEST_newer"

        # Now update the older one — it should become the latest by updated_at
        time.sleep(1.1)
        requests.put(f"{API}/episodes/{older_id}", json={
            "season_id": season_id, "title": "TEST_older_edited", "description": "d",
            "order": 1, "mopado_reward": 5})
        latest2 = requests.get(f"{API}/episodes/latest/current").json()
        assert latest2["id"] == older_id
        assert latest2["title"] == "TEST_older_edited"

        requests.delete(f"{API}/episodes/{older_id}")
        requests.delete(f"{API}/episodes/{newer_id}")


# ---------- Cleanup on PUT/DELETE ----------
class TestCleanupOnEditDelete:
    def _register_user(self):
        email = f"TEST_cleanup_{uuid.uuid4().hex[:8]}@mopado.fr"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "test123", "family_name": "TEST Cleanup",
            "nb_children": 1, "children_ages": [10]})
        return r.json()["user"]["id"]

    def _create_episode(self, season_id, badge=True):
        payload = {
            "season_id": season_id, "title": f"TEST_ep_{uuid.uuid4().hex[:6]}",
            "description": "d", "order": 5, "mopado_reward": 7,
        }
        if badge:
            payload["badge_name"] = "TEST_Badge_Cleanup"
            payload["badge_description"] = "test badge"
        r = requests.post(f"{API}/episodes", json=payload)
        return r.json()["id"]

    def _complete_episode(self, user_id, season_id, ep_id):
        s = requests.post(f"{API}/sessions/start", json={
            "family_id": user_id, "episode_id": ep_id, "season_id": season_id})
        sid = s.json()["session_id"]
        c = requests.put(f"{API}/sessions/{sid}/complete", json={"closing_word": "TEST_word"})
        return c.json(), sid

    def test_put_cleans_up_user_rewards(self, season_id):
        user_id = self._register_user()
        ep_id = self._create_episode(season_id, badge=True)

        completion, _ = self._complete_episode(user_id, season_id, ep_id)
        assert completion["mopado_earned"] == 7
        assert "TEST_Badge_Cleanup" in completion.get("badges_earned", [])

        # Verify user state after completion
        u = requests.get(f"{API}/family/{user_id}").json()
        assert u["mopado_dollars"] == 7
        assert "TEST_Badge_Cleanup" in u["badges"]
        assert ep_id in u["completed_episodes"]

        # Now PUT the episode → should clean up
        r = requests.put(f"{API}/episodes/{ep_id}", json={
            "season_id": season_id, "title": "TEST_edited", "description": "d",
            "order": 5, "mopado_reward": 7, "badge_name": "TEST_Badge_Cleanup"})
        assert r.status_code == 200

        u2 = requests.get(f"{API}/family/{user_id}").json()
        assert u2["mopado_dollars"] == 0, "mopado_dollars should be decremented by mopado_reward"
        assert "TEST_Badge_Cleanup" not in u2["badges"]
        assert ep_id not in u2["completed_episodes"]

        # Sessions for that episode should be deleted
        sessions = requests.get(f"{API}/sessions/family/{user_id}").json()
        assert not any(s.get("episode_id") == ep_id for s in sessions)

        requests.delete(f"{API}/episodes/{ep_id}")

    def test_delete_cleans_up_user_rewards(self, season_id):
        user_id = self._register_user()
        ep_id = self._create_episode(season_id, badge=True)

        self._complete_episode(user_id, season_id, ep_id)
        u = requests.get(f"{API}/family/{user_id}").json()
        assert u["mopado_dollars"] == 7
        assert ep_id in u["completed_episodes"]

        r = requests.delete(f"{API}/episodes/{ep_id}")
        assert r.status_code == 200

        u2 = requests.get(f"{API}/family/{user_id}").json()
        assert u2["mopado_dollars"] == 0
        assert "TEST_Badge_Cleanup" not in u2["badges"]
        assert ep_id not in u2["completed_episodes"]

    def test_put_no_badge_still_decrements_mopado(self, season_id):
        user_id = self._register_user()
        ep_id = self._create_episode(season_id, badge=False)
        self._complete_episode(user_id, season_id, ep_id)
        u = requests.get(f"{API}/family/{user_id}").json()
        assert u["mopado_dollars"] == 7

        requests.put(f"{API}/episodes/{ep_id}", json={
            "season_id": season_id, "title": "TEST_no_badge_edit", "description": "d",
            "order": 5, "mopado_reward": 7})
        u2 = requests.get(f"{API}/family/{user_id}").json()
        assert u2["mopado_dollars"] == 0
        assert ep_id not in u2["completed_episodes"]

        requests.delete(f"{API}/episodes/{ep_id}")
