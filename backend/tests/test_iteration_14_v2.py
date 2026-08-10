"""
Iteration 14 v2 confirmation tests.

Verifies the additional hardening applied after iteration 14:
  1. Backend nulls out `closing_word` in the sessions collection when the
     episode has already been completed by the family — even if a rogue
     client posts a non-empty word.
  2. First completion returns the full payload (badges_earned,
     bonus_mission, closing_message, reward_message).
  3. PUT /api/episodes/{id} resets user cleanup AND redo grants mopado again.
"""

import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register(api):
    email = f"iter14v2-{uuid.uuid4().hex[:8]}@mopado.fr"
    r = api.post(f"{API}/auth/register", json={
        "email": email, "password": "pwd12345",
        "family_name": "V2 Test", "nb_children": 1, "children_ages": [10],
    })
    assert r.status_code == 200, r.text
    return r.json()["user"]["id"]


def _latest_ep(api):
    r = api.get(f"{API}/episodes/latest/current")
    assert r.status_code == 200
    return r.json()


def _start(api, fid, ep):
    r = api.post(f"{API}/sessions/start", json={
        "family_id": fid, "episode_id": ep["id"], "season_id": ep["season_id"],
    })
    assert r.status_code == 200
    return r.json()["session_id"]


def _complete(api, sid, word):
    r = api.put(f"{API}/sessions/{sid}/complete", json={"closing_word": word})
    assert r.status_code == 200
    return r.json()


class TestV2FirstCompletionPayload:
    def test_first_completion_returns_full_payload(self, api):
        fid = _register(api)
        ep = _latest_ep(api)
        sid = _start(api, fid, ep)
        result = _complete(api, sid, "Excellent")

        assert result["already_completed"] is False
        assert result["mopado_earned"] > 0
        # Full payload keys must exist on first completion
        assert "badges_earned" in result
        assert "reward_message" in result
        assert "closing_message" in result
        # bonus_mission key must be present (may be None if episode has none)
        assert "bonus_mission" in result


class TestV2SecondCompletionHardening:
    def test_second_completion_rogue_word_is_nulled_in_progress(self, api):
        """The key v2 fix: even if the client sends a non-empty word on the
        second run, /api/progress must NOT expose it in closing_words_history."""
        fid = _register(api)
        ep = _latest_ep(api)

        sid1 = _start(api, fid, ep)
        _complete(api, sid1, "MotOriginal")

        sid2 = _start(api, fid, ep)
        r2 = _complete(api, sid2, "MotBypass")

        assert r2["already_completed"] is True
        assert r2["mopado_earned"] == 0

        # No additional fields expected on already_completed response
        assert "badges_earned" not in r2 or r2.get("badges_earned") in (None, [])

        # Verify mur familial via /api/progress
        prog = api.get(f"{API}/progress/{fid}").json()
        words = [w["closing_word"] for w in prog["closing_words_history"]]
        assert "MotOriginal" in words
        assert "MotBypass" not in words, (
            f"Rogue closing_word leaked into mur familial: {words}"
        )

    def test_second_completion_mopado_unchanged(self, api):
        fid = _register(api)
        ep = _latest_ep(api)
        reward = ep.get("mopado_reward", 5)

        _complete(api, _start(api, fid, ep), "First")
        _complete(api, _start(api, fid, ep), "Second")

        fam = api.get(f"{API}/family/{fid}").json()
        assert fam["mopado_dollars"] == reward
        assert fam["completed_episodes"].count(ep["id"]) == 1


class TestV2PutEpisodeRedo:
    def test_put_episode_allows_fresh_first_time_completion(self, api):
        fid = _register(api)
        ep = _latest_ep(api)
        reward = ep.get("mopado_reward", 5)

        _complete(api, _start(api, fid, ep), "Avant")
        fam1 = api.get(f"{API}/family/{fid}").json()
        assert fam1["mopado_dollars"] == reward

        # PUT the episode with its own payload to trigger cleanup
        put_payload = {
            "season_id": ep["season_id"],
            "title": ep["title"],
            "order": ep.get("order", 0),
            "description": ep.get("description", ""),
            "cards": ep.get("cards", []),
            "cards_after_game": ep.get("cards_after_game", []),
            "mopado_reward": reward,
        }
        for k in ("video_filename", "cards_message", "mini_game",
                  "reward_message", "bonus_mission", "closing_message",
                  "badge_name", "badge_description"):
            if ep.get(k) is not None:
                put_payload[k] = ep[k]

        r_put = api.put(f"{API}/episodes/{ep['id']}", json=put_payload)
        assert r_put.status_code == 200, r_put.text

        fam2 = api.get(f"{API}/family/{fid}").json()
        assert ep["id"] not in fam2["completed_episodes"]
        assert fam2["mopado_dollars"] == 0

        # Redo → full first-time payload again
        r_redo = _complete(api, _start(api, fid, ep), "AprèsEdit")
        assert r_redo["already_completed"] is False
        assert r_redo["mopado_earned"] == reward
        assert "closing_message" in r_redo
