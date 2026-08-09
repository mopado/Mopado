"""
Tests for Mopado 3 bug fixes:
- BUG 1: New episodes appear in frontend flow (GET after POST)
- BUG 2: No duplicate Mopado$ rewards on re-completing same episode
- BUG 3: Auth/login flow (needed by logout on frontend)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://mopado-family-1.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

TEST_EMAIL = "famille.test@mopado.fr"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def test_user(api):
    # Try login, register if not exists
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if r.status_code != 200:
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL, "password": TEST_PASSWORD,
            "family_name": "Test", "nb_children": 2, "children_ages": [10, 12]
        })
    assert r.status_code == 200, f"Auth failed: {r.status_code} {r.text}"
    data = r.json()
    return {"id": data["user"]["id"], "token": data["token"], "user": data["user"]}


# ============ AUTH / HEALTH ============
class TestAuth:
    def test_login_returns_token_and_user(self, api, test_user):
        assert "token" in test_user and test_user["token"]
        assert test_user["id"]

    def test_register_new_user(self, api):
        # BUG 3 support: user must be able to register a new account after logout
        unique = f"TEST_logout_{uuid.uuid4().hex[:8]}@mopado.fr"
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique, "password": "newpass123",
            "family_name": "NewFam", "nb_children": 1, "children_ages": [5]
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == unique
        assert "token" in data


# ============ BUG 1: New episodes appear ============
class TestBug1EpisodesAppear:
    created_ids = {"season": None, "episode": None}

    def test_create_season_then_episode_appears(self, api):
        # Create season
        season_payload = {
            "name": f"TEST_Season_{uuid.uuid4().hex[:6]}",
            "description": "Test season for bug1",
            "order": 999
        }
        r = api.post(f"{BASE_URL}/api/seasons", json=season_payload)
        assert r.status_code == 200, r.text
        season_id = r.json()["id"]
        self.__class__.created_ids["season"] = season_id

        # Verify GET seasons contains it
        r = api.get(f"{BASE_URL}/api/seasons")
        assert r.status_code == 200
        assert any(s["id"] == season_id for s in r.json()), "New season not returned in GET /api/seasons"

        # Create episode
        ep_payload = {
            "season_id": season_id,
            "title": f"TEST_Ep_{uuid.uuid4().hex[:6]}",
            "description": "Test episode",
            "order": 1,
            "cards": [{"type": "question", "content": "Test?"}],
            "mopado_reward": 7
        }
        r = api.post(f"{BASE_URL}/api/episodes", json=ep_payload)
        assert r.status_code == 200, r.text
        ep_id = r.json()["id"]
        self.__class__.created_ids["episode"] = ep_id

        # Verify GET episodes by season contains new episode
        r = api.get(f"{BASE_URL}/api/episodes/season/{season_id}")
        assert r.status_code == 200
        eps = r.json()
        found = next((e for e in eps if e["id"] == ep_id), None)
        assert found is not None, "New episode not returned by GET /api/episodes/season/{season_id}"
        assert found["title"] == ep_payload["title"]
        assert found["mopado_reward"] == 7

    def test_cleanup_bug1(self, api):
        # cleanup
        if self.__class__.created_ids["episode"]:
            api.delete(f"{BASE_URL}/api/episodes/{self.__class__.created_ids['episode']}")
        if self.__class__.created_ids["season"]:
            api.delete(f"{BASE_URL}/api/seasons/{self.__class__.created_ids['season']}")


# ============ BUG 2: No duplicate rewards ============
class TestBug2NoDuplicateRewards:
    ids = {"season": None, "episode": None, "user_email": None, "user_id": None}

    @pytest.fixture(autouse=True)
    def setup_data(self, api):
        if self.__class__.ids["season"] is not None:
            return
        # Create fresh user for isolation
        email = f"TEST_bug2_{uuid.uuid4().hex[:8]}@mopado.fr"
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "pass123",
            "family_name": "Bug2", "nb_children": 1, "children_ages": [7]
        })
        assert r.status_code == 200, r.text
        self.__class__.ids["user_id"] = r.json()["user"]["id"]
        self.__class__.ids["user_email"] = email

        # Create season+episode
        r = api.post(f"{BASE_URL}/api/seasons", json={
            "name": f"TEST_B2_{uuid.uuid4().hex[:5]}", "description": "d", "order": 998
        })
        self.__class__.ids["season"] = r.json()["id"]
        r = api.post(f"{BASE_URL}/api/episodes", json={
            "season_id": self.__class__.ids["season"],
            "title": "TEST_B2_Ep", "description": "d", "order": 1,
            "cards": [], "mopado_reward": 10
        })
        self.__class__.ids["episode"] = r.json()["id"]

    def _start_and_complete(self, api, closing_word):
        r = api.post(f"{BASE_URL}/api/sessions/start", json={
            "family_id": self.__class__.ids["user_id"],
            "episode_id": self.__class__.ids["episode"],
            "season_id": self.__class__.ids["season"],
        })
        assert r.status_code == 200, r.text
        sess_id = r.json()["session_id"]
        r = api.put(f"{BASE_URL}/api/sessions/{sess_id}/complete",
                    json={"closing_word": closing_word})
        assert r.status_code == 200, r.text
        return r.json()

    def test_first_completion_gives_reward(self, api):
        result = self._start_and_complete(api, "premier")
        assert result["mopado_earned"] == 10, f"Expected 10, got {result}"
        assert result.get("already_completed") is False

        # Verify mopado_dollars updated
        r = api.get(f"{BASE_URL}/api/family/{self.__class__.ids['user_id']}")
        assert r.status_code == 200
        assert r.json()["mopado_dollars"] == 10
        assert self.__class__.ids["episode"] in r.json()["completed_episodes"]

    def test_second_completion_no_reward(self, api):
        # Get current balance
        r = api.get(f"{BASE_URL}/api/family/{self.__class__.ids['user_id']}")
        balance_before = r.json()["mopado_dollars"]

        # Start & complete same episode again
        result = self._start_and_complete(api, "second")
        assert result["mopado_earned"] == 0, f"Duplicate reward given! {result}"
        assert result.get("already_completed") is True, f"already_completed flag missing: {result}"

        # Verify balance unchanged
        r = api.get(f"{BASE_URL}/api/family/{self.__class__.ids['user_id']}")
        balance_after = r.json()["mopado_dollars"]
        assert balance_after == balance_before, f"Balance changed: {balance_before} -> {balance_after}"

    def test_cleanup_bug2(self, api):
        if self.__class__.ids["episode"]:
            api.delete(f"{BASE_URL}/api/episodes/{self.__class__.ids['episode']}")
        if self.__class__.ids["season"]:
            api.delete(f"{BASE_URL}/api/seasons/{self.__class__.ids['season']}")
