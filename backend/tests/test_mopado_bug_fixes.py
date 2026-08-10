"""
Regression tests for Mopado bug fixes:
1. Registration works in preview env
2. Session complete correctly returns already_completed=True and mopado_earned=0 when
   the user has previously completed the episode.
3. Data integrity: user's completed_episodes contains only valid (existing) episode IDs.

Note: On the frontend, the 'Épisode déjà effectué' BANNER is driven by
user.completed_episodes.includes(episodeId). No dedicated /start already_completed flag
is returned by the current backend, so we verify the underlying data source.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://mopado-family-1.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = "famille.test@mopado.fr"
TEST_PASSWORD = "test123"
KNOWN_EPISODE_ID = "6a7920b673e294da877d8c35"
TEST_FAMILY_ID_HINT = "6a54c033292f214a7e91f479"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api_client):
    r = api_client.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} - {r.text}"
    return r.json()


# ---------- TEST 1: Registration ----------
class TestRegistration:
    def test_register_new_account_and_persist(self, api_client):
        unique = uuid.uuid4().hex[:8]
        payload = {
            "email": f"test_{unique}@mopado.fr",
            "password": "test123",
            "family_name": f"TEST Famille {unique}",
            "nb_children": 2,
            "children_ages": [10, 12],
        }
        r = api_client.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, f"Register failed: {r.status_code} - {r.text}"
        data = r.json()
        assert "token" in data and "user" in data, f"Missing token/user: {data}"
        user = data["user"]
        assert user["email"] == payload["email"]
        assert user["family_name"] == payload["family_name"]
        assert user["nb_children"] == 2
        assert user["children_ages"] == [10, 12]
        assert user["mopado_dollars"] == 0
        assert user["completed_episodes"] == []
        assert "_id" not in user, "MongoDB _id should not be exposed"
        user_id = user["id"]

        # Verify GET /api/family/{user_id}
        r2 = api_client.get(f"{API}/family/{user_id}")
        assert r2.status_code == 200, f"GET family failed: {r2.status_code} - {r2.text}"
        fam = r2.json()
        assert fam["email"] == payload["email"]
        assert fam["family_name"] == payload["family_name"]
        assert fam["completed_episodes"] == []
        assert "_id" not in fam

    def test_duplicate_registration_rejected(self, api_client):
        r = api_client.post(
            f"{API}/auth/register",
            json={
                "email": TEST_EMAIL,
                "password": "whatever",
                "family_name": "dup",
                "nb_children": 1,
                "children_ages": [5],
            },
        )
        assert r.status_code == 400, f"Duplicate should be 400. Got: {r.status_code} - {r.text}"


# ---------- TEST 2 & 3: Already-completed flow ----------
class TestAlreadyCompletedFlow:
    def test_episode_exists(self, api_client):
        r = api_client.get(f"{API}/episodes/{KNOWN_EPISODE_ID}")
        assert r.status_code == 200, f"Known episode missing: {r.text}"
        ep = r.json()
        assert ep.get("mopado_reward", 0) > 0

    def test_start_complete_and_replay(self, api_client):
        login = _login(api_client)
        user = login["user"]
        user_id = user["id"]
        season_id = None

        ep = api_client.get(f"{API}/episodes/{KNOWN_EPISODE_ID}").json()
        season_id = ep.get("season_id") or ep.get("id")

        # ------ START #1 ------
        start_payload = {
            "family_id": user_id,
            "episode_id": KNOWN_EPISODE_ID,
            "season_id": season_id,
        }
        r_start1 = api_client.post(f"{API}/sessions/start", json=start_payload)
        assert r_start1.status_code == 200, f"Start #1 failed: {r_start1.text}"
        s1 = r_start1.json()
        assert "session_id" in s1
        session_id_1 = s1["session_id"]

        # Fetch user state at this moment
        fam_before = api_client.get(f"{API}/family/{user_id}").json()
        was_already_completed = KNOWN_EPISODE_ID in fam_before.get("completed_episodes", [])
        print(f"[INFO] Was already-completed before test: {was_already_completed}")

        # ------ COMPLETE #1 ------
        r_c1 = api_client.put(
            f"{API}/sessions/{session_id_1}/complete",
            json={"closing_word": "TestWord1"},
        )
        assert r_c1.status_code == 200, f"Complete #1 failed: {r_c1.text}"
        c1 = r_c1.json()
        if was_already_completed:
            assert c1.get("mopado_earned") == 0
            assert c1.get("already_completed") is True
        else:
            # First time completing -> reward > 0, already_completed False
            assert c1.get("mopado_earned", 0) > 0, f"Expected reward on first complete, got {c1}"
            assert c1.get("already_completed") is False

        # ------ START #2 (replay) ------
        r_start2 = api_client.post(f"{API}/sessions/start", json=start_payload)
        assert r_start2.status_code == 200, f"Start #2 failed: {r_start2.text}"
        s2 = r_start2.json()
        session_id_2 = s2["session_id"]

        # Verify: user's completed_episodes now contains this episode -> frontend banner will show
        fam_after = api_client.get(f"{API}/family/{user_id}").json()
        assert KNOWN_EPISODE_ID in fam_after.get("completed_episodes", []), (
            "After completion, user.completed_episodes must contain the episode ID "
            "(this is what the frontend banner checks)."
        )

        # ------ COMPLETE #2 (replay - should earn 0 & already_completed=True) ------
        r_c2 = api_client.put(
            f"{API}/sessions/{session_id_2}/complete",
            json={"closing_word": "TestWord2"},
        )
        assert r_c2.status_code == 200, f"Complete #2 failed: {r_c2.text}"
        c2 = r_c2.json()
        assert c2.get("mopado_earned") == 0, f"Replay should earn 0. Got: {c2}"
        assert c2.get("already_completed") is True, f"already_completed must be True on replay. Got: {c2}"


# ---------- TEST 4: Data integrity ----------
class TestDataIntegrity:
    def test_test_user_completed_episodes_all_valid(self, api_client):
        # Fetch all episode ids across seasons
        seasons = api_client.get(f"{API}/seasons").json()
        valid_ids = set()
        for s in seasons:
            sid = s.get("id") or s.get("_id")
            if not sid:
                continue
            eps = api_client.get(f"{API}/episodes/season/{sid}").json()
            for e in eps:
                eid = e.get("id") or e.get("_id")
                if eid:
                    valid_ids.add(eid)

        # Some episodes may exist without season association; ensure the known episode is present
        r_known = api_client.get(f"{API}/episodes/{KNOWN_EPISODE_ID}")
        if r_known.status_code == 200:
            valid_ids.add(KNOWN_EPISODE_ID)

        login = _login(api_client)
        user_id = login["user"]["id"]
        fam = api_client.get(f"{API}/family/{user_id}").json()
        assert "_id" not in fam
        completed = fam.get("completed_episodes", [])
        stale = [cid for cid in completed if cid not in valid_ids]
        assert not stale, (
            f"Stale episode IDs found for {TEST_EMAIL}: {stale}. "
            f"Valid episode IDs: {sorted(valid_ids)}"
        )

    def test_hint_family_no_stale_ids(self, api_client):
        seasons = api_client.get(f"{API}/seasons").json()
        valid_ids = set()
        for s in seasons:
            sid = s.get("id") or s.get("_id")
            if not sid:
                continue
            eps = api_client.get(f"{API}/episodes/season/{sid}").json()
            for e in eps:
                eid = e.get("id") or e.get("_id")
                if eid:
                    valid_ids.add(eid)
        r_known = api_client.get(f"{API}/episodes/{KNOWN_EPISODE_ID}")
        if r_known.status_code == 200:
            valid_ids.add(KNOWN_EPISODE_ID)

        r = api_client.get(f"{API}/family/{TEST_FAMILY_ID_HINT}")
        if r.status_code != 200:
            pytest.skip(f"Family {TEST_FAMILY_ID_HINT} not present: {r.status_code}")
        fam = r.json()
        stale = [cid for cid in fam.get("completed_episodes", []) if cid not in valid_ids]
        assert not stale, f"Stale IDs in family {TEST_FAMILY_ID_HINT}: {stale}"
