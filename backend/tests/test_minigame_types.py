"""Tests for multi-type mini-game feature (letters, true_false, ranking, quiz, custom)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mopado-family-1.preview.emergentagent.com").rstrip("/")
SEASON_ID = "6a78e7a45f87998d7ed8e2c3"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    return []


def _create_episode(api, payload):
    r = api.post(f"{BASE_URL}/api/episodes", json=payload, timeout=30)
    assert r.status_code == 200, f"Create episode failed: {r.status_code} {r.text}"
    return r.json()["id"]


def _get_episode(api, ep_id):
    r = api.get(f"{BASE_URL}/api/episodes/{ep_id}", timeout=30)
    assert r.status_code == 200, f"Get episode failed: {r.status_code} {r.text}"
    return r.json()


# ------------- Season sanity -------------
class TestSeasonSanity:
    def test_season_exists(self, api):
        r = api.get(f"{BASE_URL}/api/seasons/{SEASON_ID}", timeout=30)
        assert r.status_code == 200, f"Reference season not found: {r.text}"


# ------------- Feature 1 & 5: letters -------------
class TestLettersGame:
    def test_create_letters_episode(self, api, created_ids):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_letters_ep",
            "description": "letters test",
            "order": 900,
            "cards": [],
            "mini_game": {
                "type": "letters",
                "name": "C'est quali",
                "instructions": "Trouve une qualité",
                "data": None,
            },
            "mopado_reward": 5,
        }
        ep_id = _create_episode(api, payload)
        created_ids.append(ep_id)
        ep = _get_episode(api, ep_id)
        assert ep["mini_game"]["type"] == "letters"
        assert ep["mini_game"]["name"] == "C'est quali"
        # _id should not leak
        assert "_id" not in ep


# ------------- Feature 2: true_false -------------
class TestTrueFalseGame:
    def test_create_true_false_episode(self, api, created_ids):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_tf_ep",
            "description": "tf test",
            "order": 901,
            "cards": [],
            "mini_game": {
                "type": "true_false",
                "name": "Vrai ou Faux",
                "instructions": "Réponds ensemble",
                "data": {
                    "statements": [
                        {"text": "Rire fait du bien", "answer": True},
                        {"text": "Il faut cacher ses émotions", "answer": False},
                    ]
                },
            },
            "mopado_reward": 5,
        }
        ep_id = _create_episode(api, payload)
        created_ids.append(ep_id)
        ep = _get_episode(api, ep_id)
        assert ep["mini_game"]["type"] == "true_false"
        stmts = ep["mini_game"]["data"]["statements"]
        assert len(stmts) == 2
        assert stmts[0]["answer"] is True
        assert stmts[1]["answer"] is False
        assert stmts[0]["text"] == "Rire fait du bien"


# ------------- Feature 3: ranking -------------
class TestRankingGame:
    def test_create_ranking_episode(self, api, created_ids):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_ranking_ep",
            "description": "ranking test",
            "order": 902,
            "cards": [],
            "mini_game": {
                "type": "ranking",
                "name": "Classement",
                "instructions": "Classe ces items",
                "data": {
                    "question": "Classe par ordre de préférence",
                    "items": ["Devoirs", "Ranger", "Légumes", "Dodo"],
                },
            },
            "mopado_reward": 5,
        }
        ep_id = _create_episode(api, payload)
        created_ids.append(ep_id)
        ep = _get_episode(api, ep_id)
        assert ep["mini_game"]["type"] == "ranking"
        assert ep["mini_game"]["data"]["question"] == "Classe par ordre de préférence"
        assert ep["mini_game"]["data"]["items"] == ["Devoirs", "Ranger", "Légumes", "Dodo"]


# ------------- Feature 4: quiz -------------
class TestQuizGame:
    def test_create_quiz_episode(self, api, created_ids):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_quiz_ep",
            "description": "quiz test",
            "order": 903,
            "cards": [],
            "mini_game": {
                "type": "quiz",
                "name": "Quiz",
                "instructions": "Choisis la bonne réponse",
                "data": {
                    "questions": [
                        {
                            "question": "Qu'est-ce qui rend heureux ?",
                            "answers": ["La colère", "Le partage", "La solitude"],
                            "correct": 1,
                        }
                    ]
                },
            },
            "mopado_reward": 5,
        }
        ep_id = _create_episode(api, payload)
        created_ids.append(ep_id)
        ep = _get_episode(api, ep_id)
        assert ep["mini_game"]["type"] == "quiz"
        qs = ep["mini_game"]["data"]["questions"]
        assert len(qs) == 1
        assert qs[0]["correct"] == 1
        assert len(qs[0]["answers"]) == 3
        assert qs[0]["answers"][1] == "Le partage"


# ------------- Feature: custom -------------
class TestCustomGame:
    def test_create_custom_episode(self, api, created_ids):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_custom_ep",
            "description": "custom test",
            "order": 904,
            "cards": [],
            "mini_game": {
                "type": "custom",
                "name": "Jeu libre",
                "instructions": "Invente ton jeu",
                "data": None,
            },
            "mopado_reward": 5,
        }
        ep_id = _create_episode(api, payload)
        created_ids.append(ep_id)
        ep = _get_episode(api, ep_id)
        assert ep["mini_game"]["type"] == "custom"


# ------------- Feature 6: Backward compatibility (default 'letters') -------------
class TestBackwardCompat:
    def test_minigame_without_type_defaults_to_letters(self, api, created_ids):
        # Send mini_game without 'type' field to verify default
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_default_ep",
            "description": "default type",
            "order": 905,
            "cards": [],
            "mini_game": {
                "name": "Legacy game",
                "instructions": "Legacy instructions",
            },
            "mopado_reward": 5,
        }
        ep_id = _create_episode(api, payload)
        created_ids.append(ep_id)
        ep = _get_episode(api, ep_id)
        # Pydantic default should apply -> 'letters'
        assert ep["mini_game"].get("type") == "letters", (
            f"Default mini_game.type should be 'letters', got {ep['mini_game'].get('type')}"
        )

    def test_episode_without_minigame(self, api, created_ids):
        payload = {
            "season_id": SEASON_ID,
            "title": "TEST_no_game_ep",
            "description": "no game",
            "order": 906,
            "cards": [],
            "mini_game": None,
            "mopado_reward": 5,
        }
        ep_id = _create_episode(api, payload)
        created_ids.append(ep_id)
        ep = _get_episode(api, ep_id)
        assert ep.get("mini_game") is None


# ------------- Feature 7: Admin panel HTML -------------
class TestAdminPanel:
    def test_admin_panel_has_game_type_selector(self, api):
        r = api.get(f"{BASE_URL}/api/admin-panel", timeout=30)
        assert r.status_code == 200
        html = r.text
        # game type options
        for val in ["letters", "true_false", "ranking", "quiz", "custom"]:
            assert f'value="{val}"' in html, f"Missing option value={val}"
        # dynamic field containers
        for fid in [
            "true-false-fields",
            "ranking-fields",
            "quiz-fields",
            "letters-fields",
            "episode-game-type",
        ]:
            assert f'id="{fid}"' in html, f"Missing element id={fid}"
        # dynamic field text inputs
        assert 'id="episode-true-false-statements"' in html
        assert 'id="episode-ranking-question"' in html
        assert 'id="episode-ranking-items"' in html
        assert 'id="episode-quiz-questions"' in html


# ------------- Provided seeded IDs sanity -------------
@pytest.mark.parametrize(
    "ep_id,expected_type",
    [
        ("6a78ef64fa41837ea9ac064f", "true_false"),
        ("6a78ef64fa41837ea9ac0650", "ranking"),
        ("6a78ef64fa41837ea9ac0651", "quiz"),
    ],
)
def test_seeded_episodes_have_correct_type(api, ep_id, expected_type):
    r = api.get(f"{BASE_URL}/api/episodes/{ep_id}", timeout=30)
    if r.status_code != 200:
        pytest.skip(f"Seeded episode {ep_id} not present ({r.status_code})")
    ep = r.json()
    assert ep.get("mini_game") is not None, f"Seeded episode {ep_id} has no mini_game"
    assert ep["mini_game"].get("type") == expected_type


# ------------- Cleanup -------------
def test_zzz_cleanup(api, created_ids):
    for ep_id in created_ids:
        api.delete(f"{BASE_URL}/api/episodes/{ep_id}", timeout=30)
    # verify at least one gone
    if created_ids:
        r = api.get(f"{BASE_URL}/api/episodes/{created_ids[0]}", timeout=30)
        assert r.status_code in (400, 404)
