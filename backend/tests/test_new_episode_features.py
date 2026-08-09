"""Backend tests for the 12 new episode features (iteration 6).

Covers:
  BACKEND 1: Episode model accepts & returns new fields
  BACKEND 2: PUT /sessions/{id}/complete returns new fields
  BACKEND 3: Badge earning logic (add once, no duplicate)
  BACKEND 4: Existing episode 6a7910733ebcb913a5aa5aaf has new fields
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://mopado-family-1.preview.emergentagent.com",
).rstrip("/")

SEASON_ID = "6a78e7a45f87998d7ed8e2c3"
EXISTING_EPISODE_ID = "6a7910733ebcb913a5aa5aaf"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_user(api):
    """Create a throwaway family user for badge / completion tests."""
    email = f"TEST_new_features_{uuid.uuid4().hex[:8]}@mopado.fr"
    payload = {
        "email": email,
        "password": "test123",
        "family_name": "TEST_Features_Family",
        "nb_children": 1,
        "children_ages": [10],
    }
    r = api.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["user"]


@pytest.fixture(scope="module")
def created_episode_id(api):
    """Create a full-featured episode and clean up after module tests."""
    payload = {
        "season_id": SEASON_ID,
        "title": "TEST_Full_Featured_Episode",
        "description": "TEST episode with all new fields",
        "order": 999,
        "cards": [{"type": "question", "content": "TEST card before"}],
        "cards_message": "TEST cards message",
        "cards_after_game": [{"type": "question", "content": "TEST card after"}],
        "mini_game": {
            "type": "letters",
            "name": "TEST letters",
            "instructions": "TEST instructions",
        },
        "mopado_reward": 7,
        "reward_message": "TEST reward message",
        "bonus_mission": "TEST bonus mission",
        "closing_message": "TEST closing message",
        "badge_name": "TEST_Badge_NewFeatures",
        "badge_description": "TEST badge desc",
    }
    r = api.post(f"{BASE_URL}/api/episodes", json=payload)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    ep_id = r.json()["id"]
    yield ep_id
    # cleanup
    api.delete(f"{BASE_URL}/api/episodes/{ep_id}")


# ---------- BACKEND 1: new fields round-trip ----------
class TestEpisodeNewFields:
    def test_episode_returns_all_new_fields(self, api, created_episode_id):
        r = api.get(f"{BASE_URL}/api/episodes/{created_episode_id}")
        assert r.status_code == 200, r.text
        ep = r.json()
        assert ep["cards_message"] == "TEST cards message"
        assert ep["cards_after_game"][0]["content"] == "TEST card after"
        assert ep["mopado_reward"] == 7
        assert ep["reward_message"] == "TEST reward message"
        assert ep["bonus_mission"] == "TEST bonus mission"
        assert ep["closing_message"] == "TEST closing message"
        assert ep["badge_name"] == "TEST_Badge_NewFeatures"
        assert ep["badge_description"] == "TEST badge desc"
        assert "_id" not in ep  # ObjectId must be excluded

    def test_episode_defaults_when_fields_omitted(self, api):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_Defaults_Episode",
            "description": "TEST defaults",
            "order": 998,
        }
        r = api.post(f"{BASE_URL}/api/episodes", json=payload)
        assert r.status_code == 200
        ep_id = r.json()["id"]
        try:
            g = api.get(f"{BASE_URL}/api/episodes/{ep_id}").json()
            assert g["cards_message"] == "On répond chacun son tour."
            assert g["cards_after_game"] == []
            assert (
                g["closing_message"]
                == "Rendez-vous la semaine prochaine pour un nouveau moment qui compte, ensemble !"
            )
            assert g["mopado_reward"] == 5
            assert g["badge_name"] is None
            assert g["bonus_mission"] is None
        finally:
            api.delete(f"{BASE_URL}/api/episodes/{ep_id}")


# ---------- BACKEND 2 + 3: complete session returns new fields, badges dedup ----------
class TestCompleteSessionAndBadges:
    def test_complete_returns_new_fields_and_awards_badge(
        self, api, test_user, created_episode_id
    ):
        # start session
        start = api.post(
            f"{BASE_URL}/api/sessions/start",
            json={
                "family_id": test_user["id"],
                "episode_id": created_episode_id,
                "season_id": SEASON_ID,
            },
        )
        assert start.status_code == 200
        sid = start.json()["session_id"]

        # complete
        c = api.put(
            f"{BASE_URL}/api/sessions/{sid}/complete",
            json={"closing_word": "TEST_word"},
        )
        assert c.status_code == 200, c.text
        data = c.json()
        # new fields present
        assert data["reward_message"] == "TEST reward message"
        assert data["bonus_mission"] == "TEST bonus mission"
        assert data["closing_message"] == "TEST closing message"
        assert "badges_earned" in data
        assert data["badges_earned"] == ["TEST_Badge_NewFeatures"]
        assert data["mopado_earned"] == 7
        assert data["already_completed"] is False

        # verify persisted on user
        fam = api.get(f"{BASE_URL}/api/family/{test_user['id']}").json()
        assert "TEST_Badge_NewFeatures" in fam["badges"]
        assert created_episode_id in fam["completed_episodes"]
        assert fam["mopado_dollars"] >= 7

    def test_badge_not_duplicated_on_second_completion(
        self, api, test_user, created_episode_id
    ):
        # start + complete again
        start = api.post(
            f"{BASE_URL}/api/sessions/start",
            json={
                "family_id": test_user["id"],
                "episode_id": created_episode_id,
                "season_id": SEASON_ID,
            },
        )
        sid = start.json()["session_id"]
        c = api.put(
            f"{BASE_URL}/api/sessions/{sid}/complete",
            json={"closing_word": "TEST_word2"},
        )
        assert c.status_code == 200
        data = c.json()
        # second time: no reward, marked as already completed
        assert data["already_completed"] is True
        assert data["mopado_earned"] == 0

        # user still has ONE copy of the badge
        fam = api.get(f"{BASE_URL}/api/family/{test_user['id']}").json()
        badge_count = fam["badges"].count("TEST_Badge_NewFeatures")
        assert badge_count == 1, f"expected 1 badge, got {badge_count}"


# ---------- BACKEND 4: pre-seeded episode has new fields ----------
class TestPreSeededEpisode:
    def test_seeded_episode_has_new_fields(self, api):
        r = api.get(f"{BASE_URL}/api/episodes/{EXISTING_EPISODE_ID}")
        if r.status_code == 404:
            pytest.skip(f"Seeded episode {EXISTING_EPISODE_ID} not present in DB")
        assert r.status_code == 200, r.text
        ep = r.json()
        # Fields must exist (may be defaults or custom - just verify keys present)
        for key in [
            "cards_message",
            "cards_after_game",
            "mopado_reward",
            "reward_message",
            "bonus_mission",
            "closing_message",
            "badge_name",
            "badge_description",
        ]:
            assert key in ep, f"missing field: {key}"
