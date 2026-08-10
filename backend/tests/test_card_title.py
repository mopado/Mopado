"""Tests for Card 'title' field (Iteration 8) — Mopado feature update."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mopado-family-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = "famille.test@mopado.fr"
TEST_PASSWORD = "test123"
EPISODE_WITH_TITLES = "6a7916b6cb38fed6d2a62d46"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def existing_season_id(api_client):
    r = api_client.get(f"{API}/seasons")
    assert r.status_code == 200, r.text
    seasons = r.json()
    assert isinstance(seasons, list) and len(seasons) > 0
    return seasons[0]["id"]


# ---------------- Card.title model support -----------------
class TestCardTitleModel:
    def test_create_episode_with_card_titles(self, api_client, existing_season_id):
        payload = {
            "season_id": existing_season_id,
            "title": "TEST_iter8_episode_title",
            "description": "TEST_ episode to validate optional Card.title",
            "order": 99,
            "cards": [
                {"type": "question", "title": "Réflexion",
                 "content": "Quelle qualité admires-tu chez tes parents ?"},
                {"type": "question", "content": "Carte sans titre (backward compat)"},
            ],
            "cards_after_game": [
                {"type": "activity", "title": "Bonus", "content": "Un dernier partage."}
            ],
            "mopado_reward": 5,
            "mini_game": {
                "type": "letters", "name": "Test", "instructions": "TEST"
            },
        }
        r = api_client.post(f"{API}/episodes", json=payload)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert "id" in body
        pytest.created_episode_id = body["id"]

        # GET verification — persisted correctly
        rg = api_client.get(f"{API}/episodes/{body['id']}")
        assert rg.status_code == 200
        ep = rg.json()
        assert ep["cards"][0]["title"] == "Réflexion"
        assert ep["cards"][0]["content"] == "Quelle qualité admires-tu chez tes parents ?"
        # backward compat: title is optional -> None or missing
        assert ep["cards"][1].get("title") in (None, "", None)
        assert ep["cards_after_game"][0]["title"] == "Bonus"

    def test_cleanup_created_episode(self, api_client):
        eid = getattr(pytest, "created_episode_id", None)
        if not eid:
            pytest.skip("no episode to clean")
        r = api_client.delete(f"{API}/episodes/{eid}")
        assert r.status_code in (200, 204, 404)


# ---------------- Existing seeded episode with titles -----------------
class TestSeededEpisodeWithTitles:
    def test_seeded_episode_has_expected_titles(self, api_client):
        r = api_client.get(f"{API}/episodes/{EPISODE_WITH_TITLES}")
        if r.status_code == 404:
            pytest.skip(f"Seeded episode {EPISODE_WITH_TITLES} not found in this env")
        assert r.status_code == 200, r.text
        ep = r.json()

        # cards must exist and first one has title 'Réflexion'
        assert isinstance(ep.get("cards"), list) and len(ep["cards"]) >= 1
        first = ep["cards"][0]
        assert first.get("title") == "Réflexion", f"Expected 'Réflexion', got {first.get('title')!r}"
        assert first.get("content"), "First card must have content"

        # cards_after_game[0] must have a title (per problem statement)
        assert isinstance(ep.get("cards_after_game"), list) and len(ep["cards_after_game"]) >= 1
        assert ep["cards_after_game"][0].get("title"), "cards_after_game[0].title expected non-empty"

    # /api/episodes bulk GET returns 405 in this backend; individual GET is the supported route.
