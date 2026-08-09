"""
Tests for _id leak bug fix in Mopado backend responses.

Verifies:
1. GET /api/seasons - no _id in list items (only 'id')
2. GET /api/seasons/{id} - no _id
3. GET /api/episodes/season/{id} - no _id in list items
4. GET /api/episodes/{id} - no _id
5. GET /api/sessions/family/{id} - no _id in list items
6. GET /api/badges - no _id in list items
7. Regression: All mini-game types still work (letters, true_false, ranking, quiz, custom)
8. Existing seeded episodes still return valid data with no _id
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://mopado-family-1.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

TEST_EMAIL = "famille.test@mopado.fr"
TEST_PASSWORD = "test123"

# Pre-seeded episodes from previous test iteration
SEEDED_EPISODES = {
    "true_false": "6a78ef64fa41837ea9ac064f",
    "ranking": "6a78ef64fa41837ea9ac0650",
    "quiz": "6a78ef64fa41837ea9ac0651",
}


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def test_user(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if r.status_code != 200:
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL, "password": TEST_PASSWORD,
            "family_name": "Test", "nb_children": 2, "children_ages": [10, 12]
        })
    assert r.status_code == 200, f"Auth failed: {r.status_code} {r.text}"
    data = r.json()
    return {"id": data["user"]["id"], "token": data["token"]}


def _assert_no_id_leak(obj, path=""):
    """Assert the object has no '_id' key. Return True if 'id' is present when applicable."""
    assert "_id" not in obj, f"'_id' leaked at {path}: keys={list(obj.keys())}"


# ==================== _id LEAK FIX TESTS ====================
class TestIdLeakFix:
    """Verify no MongoDB _id field is leaked in list/get endpoints."""

    def test_seasons_list_no_id_leak(self, api):
        r = api.get(f"{BASE_URL}/api/seasons")
        assert r.status_code == 200, r.text
        seasons = r.json()
        assert isinstance(seasons, list)
        assert len(seasons) > 0, "No seasons found — cannot verify"
        for i, s in enumerate(seasons):
            _assert_no_id_leak(s, path=f"seasons[{i}]")
            assert "id" in s, f"Missing 'id' in seasons[{i}]"
            assert isinstance(s["id"], str)

    def test_season_by_id_no_id_leak(self, api):
        r = api.get(f"{BASE_URL}/api/seasons")
        seasons = r.json()
        season_id = seasons[0]["id"]
        r = api.get(f"{BASE_URL}/api/seasons/{season_id}")
        assert r.status_code == 200, r.text
        s = r.json()
        _assert_no_id_leak(s, path="season")
        assert s["id"] == season_id

    def test_episodes_by_season_no_id_leak(self, api):
        r = api.get(f"{BASE_URL}/api/seasons")
        seasons = r.json()
        # Find a season with episodes
        found = False
        for s in seasons:
            r = api.get(f"{BASE_URL}/api/episodes/season/{s['id']}")
            assert r.status_code == 200
            eps = r.json()
            if eps:
                found = True
                for i, e in enumerate(eps):
                    _assert_no_id_leak(e, path=f"episodes[{i}]")
                    assert "id" in e
                    assert e.get("season_id") == s["id"]
                break
        assert found, "No season with episodes to test"

    def test_episode_by_id_no_id_leak(self, api):
        # Use one of the seeded episodes
        ep_id = SEEDED_EPISODES["true_false"]
        r = api.get(f"{BASE_URL}/api/episodes/{ep_id}")
        assert r.status_code == 200, r.text
        e = r.json()
        _assert_no_id_leak(e, path="episode")
        assert e["id"] == ep_id
        assert "mini_game" in e

    def test_sessions_family_no_id_leak(self, api, test_user):
        r = api.get(f"{BASE_URL}/api/sessions/family/{test_user['id']}")
        assert r.status_code == 200, r.text
        sessions = r.json()
        assert isinstance(sessions, list)
        # May be empty; if any, check
        for i, sess in enumerate(sessions):
            _assert_no_id_leak(sess, path=f"sessions[{i}]")
            assert "id" in sess

    def test_badges_list_no_id_leak(self, api):
        r = api.get(f"{BASE_URL}/api/badges")
        assert r.status_code == 200, r.text
        badges = r.json()
        assert isinstance(badges, list)
        for i, b in enumerate(badges):
            _assert_no_id_leak(b, path=f"badges[{i}]")
            assert "id" in b


# ==================== SEEDED EPISODES REGRESSION ====================
class TestSeededEpisodes:
    """Verify pre-existing seeded episodes still return correct mini_game.type."""

    @pytest.mark.parametrize("game_type,ep_id", list(SEEDED_EPISODES.items()))
    def test_seeded_episode(self, api, game_type, ep_id):
        r = api.get(f"{BASE_URL}/api/episodes/{ep_id}")
        assert r.status_code == 200, f"Seeded ep {ep_id} not found: {r.text}"
        e = r.json()
        _assert_no_id_leak(e, path=f"seeded[{game_type}]")
        assert e["id"] == ep_id
        assert e.get("mini_game") is not None, f"Missing mini_game on {game_type}"
        assert e["mini_game"]["type"] == game_type, \
            f"Expected mini_game.type={game_type}, got {e['mini_game'].get('type')}"


# ==================== MINI-GAME TYPES REGRESSION ====================
class TestMiniGameTypesRegression:
    """Verify POST /api/episodes and GET /api/episodes/{id} work for all 5 types."""

    created_ids = []
    season_id = None

    @pytest.fixture(autouse=True, scope="class")
    def setup_season(self, request):
        # Create one season to hold all test episodes
        r = requests.post(f"{BASE_URL}/api/seasons", json={
            "name": f"TEST_IDFIX_{uuid.uuid4().hex[:6]}",
            "description": "For _id fix regression", "order": 997
        })
        assert r.status_code == 200, r.text
        TestMiniGameTypesRegression.season_id = r.json()["id"]

        yield

        # Cleanup all created episodes + season
        for ep_id in TestMiniGameTypesRegression.created_ids:
            requests.delete(f"{BASE_URL}/api/episodes/{ep_id}")
        if TestMiniGameTypesRegression.season_id:
            requests.delete(f"{BASE_URL}/api/seasons/{TestMiniGameTypesRegression.season_id}")

    def _create_and_verify(self, api, mini_game):
        payload = {
            "season_id": self.season_id,
            "title": f"TEST_{mini_game['type']}_{uuid.uuid4().hex[:5]}",
            "description": "regression test",
            "order": 1,
            "cards": [],
            "mini_game": mini_game,
            "mopado_reward": 5,
        }
        r = api.post(f"{BASE_URL}/api/episodes", json=payload)
        assert r.status_code == 200, r.text
        ep_id = r.json()["id"]
        TestMiniGameTypesRegression.created_ids.append(ep_id)

        # GET it back and verify no _id, correct mini_game.type, data preserved
        r = api.get(f"{BASE_URL}/api/episodes/{ep_id}")
        assert r.status_code == 200
        e = r.json()
        _assert_no_id_leak(e, path=f"created[{mini_game['type']}]")
        assert e["id"] == ep_id
        assert e["mini_game"]["type"] == mini_game["type"]
        assert e["mini_game"]["name"] == mini_game["name"]
        if mini_game.get("data") is not None:
            assert e["mini_game"]["data"] == mini_game["data"], \
                f"data not preserved for {mini_game['type']}"
        return e

    def test_letters_type(self, api):
        self._create_and_verify(api, {
            "type": "letters", "name": "Lettres", "instructions": "Trouve",
            "data": None
        })

    def test_true_false_type(self, api):
        self._create_and_verify(api, {
            "type": "true_false", "name": "Vrai/Faux", "instructions": "Réponds",
            "data": {"statements": [{"text": "Le ciel est bleu", "isTrue": True}]}
        })

    def test_ranking_type(self, api):
        self._create_and_verify(api, {
            "type": "ranking", "name": "Classement", "instructions": "Classe",
            "data": {"question": "Classe par ordre", "items": ["A", "B", "C"]}
        })

    def test_quiz_type(self, api):
        self._create_and_verify(api, {
            "type": "quiz", "name": "Quiz", "instructions": "Choisis",
            "data": {"questions": [{"question": "Q1?", "answers": ["a", "b", "c"], "correct": 1}]}
        })

    def test_custom_type(self, api):
        self._create_and_verify(api, {
            "type": "custom", "name": "Custom", "instructions": "Libre",
            "data": None
        })


# ==================== PREVIOUS ENDPOINTS REGRESSION ====================
class TestPreviousEndpointsRegression:
    """Ensure auth, family, progress endpoints still work."""

    def test_login(self, api, test_user):
        assert test_user["token"]
        assert test_user["id"]

    def test_family_profile(self, api, test_user):
        r = api.get(f"{BASE_URL}/api/family/{test_user['id']}")
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["id"] == test_user["id"]
        assert "mopado_dollars" in u
        assert "completed_episodes" in u

    def test_progress(self, api, test_user):
        r = api.get(f"{BASE_URL}/api/progress/{test_user['id']}")
        assert r.status_code == 200, r.text
        p = r.json()
        assert "mopado_dollars" in p
        assert "closing_words_history" in p
        assert "total_sessions" in p

    def test_admin_stats(self, api):
        r = api.get(f"{BASE_URL}/api/admin/stats")
        assert r.status_code == 200
        d = r.json()
        assert "total_families" in d
        assert "total_seasons" in d
        assert "total_episodes" in d
