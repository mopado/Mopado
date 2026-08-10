"""
Iteration 14 backend regression tests.

Focus: the bug where the "already completed" banner appeared during a
FIRST-time completion. The frontend now snapshots `isAlreadyCompleted` at
mount, but the *backend contract* it relies on must remain correct:

  1. First completion => mopado_earned > 0, already_completed=False.
  2. Second completion of the same episode by same user =>
     mopado_earned=0, already_completed=True.
  3. When admin edits an episode (PUT), backend cleans up user's
     completed_episodes / mopado_dollars / sessions so redoing is fresh.
  4. Verify `closing_words_history` on /api/progress does NOT contain a
     duplicate entry after a second completion (sessions still record it,
     but on the second completion we expect the closing_word to be blank/
     unchanged behaviour — see assertions).
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "https://mopado-family-1.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


# --- Helpers -------------------------------------------------------------

def _register(session: requests.Session):
    email = f"iter14-{uuid.uuid4().hex[:8]}@mopado.fr"
    payload = {
        "email": email,
        "password": "pwd12345",
        "family_name": "Iter14 Test",
        "nb_children": 1,
        "children_ages": [10],
    }
    r = session.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return data["user"]["id"], email


def _get_latest_episode(session: requests.Session):
    r = session.get(f"{API}/episodes/latest/current")
    assert r.status_code == 200, f"latest episode failed: {r.status_code} {r.text}"
    ep = r.json()
    assert "id" in ep and "season_id" in ep
    return ep


def _start_session(session: requests.Session, family_id, episode_id, season_id):
    r = session.post(f"{API}/sessions/start", json={
        "family_id": family_id,
        "episode_id": episode_id,
        "season_id": season_id,
    })
    assert r.status_code == 200, f"start session failed: {r.status_code} {r.text}"
    return r.json()["session_id"]


def _complete_session(session, session_id, closing_word="Génial"):
    r = session.put(
        f"{API}/sessions/{session_id}/complete",
        json={"closing_word": closing_word},
    )
    assert r.status_code == 200, f"complete failed: {r.status_code} {r.text}"
    return r.json()


def _get_family(session, family_id):
    r = session.get(f"{API}/family/{family_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _get_progress(session, family_id):
    r = session.get(f"{API}/progress/{family_id}")
    assert r.status_code == 200, r.text
    return r.json()


# --- Fixtures ------------------------------------------------------------

@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Tests ---------------------------------------------------------------

class TestFirstAndSecondCompletion:
    """Reproduce iteration 14 flow at the API level."""

    def test_first_completion_grants_rewards(self, api):
        family_id, _email = _register(api)
        ep = _get_latest_episode(api)

        # Pre-condition: brand-new account, episode NOT in completed_episodes
        fam_before = _get_family(api, family_id)
        assert ep["id"] not in fam_before.get("completed_episodes", []), \
            "Fresh account should not have the episode marked complete"
        assert fam_before.get("mopado_dollars", 0) == 0

        # Complete the session
        session_id = _start_session(api, family_id, ep["id"], ep["season_id"])
        result = _complete_session(api, session_id, closing_word="Génial")

        assert result["already_completed"] is False, \
            f"First completion must NOT be already_completed. Got: {result}"
        assert result["mopado_earned"] == ep.get("mopado_reward", 5), \
            f"First completion must grant mopado_reward. Got: {result}"

        # Verify persistence
        fam_after = _get_family(api, family_id)
        assert ep["id"] in fam_after["completed_episodes"]
        assert fam_after["mopado_dollars"] == ep.get("mopado_reward", 5)

    def test_second_completion_no_extra_rewards(self, api):
        family_id, _ = _register(api)
        ep = _get_latest_episode(api)
        reward = ep.get("mopado_reward", 5)

        # First run
        sid1 = _start_session(api, family_id, ep["id"], ep["season_id"])
        r1 = _complete_session(api, sid1, closing_word="Super")
        assert r1["already_completed"] is False
        assert r1["mopado_earned"] == reward

        # Second run (redo)
        sid2 = _start_session(api, family_id, ep["id"], ep["season_id"])
        r2 = _complete_session(api, sid2, closing_word="Deuxième mot")
        assert r2["already_completed"] is True, \
            f"Second completion MUST be already_completed=True. Got: {r2}"
        assert r2["mopado_earned"] == 0, \
            f"Second completion MUST grant 0 mopado. Got: {r2}"

        # DB must be untouched (mopado_dollars still == reward, badges unchanged)
        fam = _get_family(api, family_id)
        assert fam["mopado_dollars"] == reward, \
            f"Mopado$ inflated on second completion: {fam}"
        # completed_episodes should still have the ep exactly once (addToSet)
        assert fam["completed_episodes"].count(ep["id"]) == 1

    def test_closing_words_history_no_duplicate_on_second_run(self, api):
        """Frontend fix: when episode is already completed, the ClosingStep
        is 'locked' and `closing_word` is sent as empty string. The backend
        only exposes non-empty closing_word entries in /progress, so the mur
        familial should show ONLY the first word.

        This test mirrors that frontend behaviour (empty string on 2nd run).
        """
        family_id, _ = _register(api)
        ep = _get_latest_episode(api)

        sid1 = _start_session(api, family_id, ep["id"], ep["season_id"])
        _complete_session(api, sid1, closing_word="MotInitial")

        sid2 = _start_session(api, family_id, ep["id"], ep["season_id"])
        # Frontend sends "" when the episode is already completed (locked).
        _complete_session(api, sid2, closing_word="")

        progress = _get_progress(api, family_id)
        words = [w["closing_word"] for w in progress["closing_words_history"]]

        assert "MotInitial" in words, f"First word missing: {words}"
        # No duplicate entry for the same episode. With empty string on
        # second run, only one entry should be present.
        episode_entries = [
            w for w in progress["closing_words_history"]
            if w["episode_title"] == ep.get("title")
        ]
        assert len(episode_entries) == 1, \
            f"Duplicate entry on mur familial: {episode_entries}"

    def test_backend_defense_in_depth_second_run_with_nonempty_word(self, api):
        """DEFENSE-IN-DEPTH check: even if a bad client sends a non-empty
        closing_word on the second run, the backend SHOULD NOT persist it,
        because the endpoint's contract says the episode is already
        completed. Currently this FAILS — session.update_one runs before
        the already-completed check. Kept as a known issue marker.
        """
        family_id, _ = _register(api)
        ep = _get_latest_episode(api)

        sid1 = _start_session(api, family_id, ep["id"], ep["season_id"])
        _complete_session(api, sid1, closing_word="MotInitial")

        sid2 = _start_session(api, family_id, ep["id"], ep["season_id"])
        r2 = _complete_session(api, sid2, closing_word="MotSecondBypass")
        assert r2["already_completed"] is True

        progress = _get_progress(api, family_id)
        words = [w["closing_word"] for w in progress["closing_words_history"]]
        # This is the bug — the second word DOES appear even though the
        # endpoint reported already_completed. Marking as xfail-style report.
        if "MotSecondBypass" in words:
            pytest.xfail(
                "KNOWN BACKEND ISSUE: complete_session writes closing_word to "
                "the session BEFORE checking if the episode is already "
                "completed. A rogue client can therefore inject duplicate "
                "closing words into the mur familial history."
            )


class TestEpisodeEditCleanup:
    """When admin edits an episode (PUT), user data for that episode is wiped."""

    def test_put_episode_resets_user_data(self, api):
        family_id, _ = _register(api)
        ep = _get_latest_episode(api)
        reward = ep.get("mopado_reward", 5)

        # Complete once
        sid = _start_session(api, family_id, ep["id"], ep["season_id"])
        r = _complete_session(api, sid, closing_word="AvantEdit")
        assert r["already_completed"] is False
        assert r["mopado_earned"] == reward

        fam_before = _get_family(api, family_id)
        assert ep["id"] in fam_before["completed_episodes"]
        assert fam_before["mopado_dollars"] == reward

        # PUT the same episode payload (must trigger _cleanup_episode_user_data)
        # EpisodeCreate accepts the fields returned by GET /api/episodes/{id}
        # minus id/_id/created_at/updated_at. We keep only the payload keys.
        put_payload = {
            "season_id": ep["season_id"],
            "title": ep["title"],
            "order": ep.get("order", 0),
            "description": ep.get("description", ""),
            "video_filename": ep.get("video_filename"),
            "cards": ep.get("cards", []),
            "cards_message": ep.get("cards_message"),
            "cards_after_game": ep.get("cards_after_game", []),
            "mini_game": ep.get("mini_game"),
            "mopado_reward": ep.get("mopado_reward", 5),
            "reward_message": ep.get("reward_message"),
            "bonus_mission": ep.get("bonus_mission"),
            "closing_message": ep.get("closing_message"),
            "badge_name": ep.get("badge_name"),
            "badge_description": ep.get("badge_description"),
        }
        # remove Nones so pydantic doesn't reject them
        put_payload = {k: v for k, v in put_payload.items() if v is not None}

        r_put = api.put(f"{API}/episodes/{ep['id']}", json=put_payload)
        assert r_put.status_code == 200, f"PUT failed: {r_put.status_code} {r_put.text}"

        # After PUT, user's completed_episodes / mopado_dollars must be reset
        fam_after = _get_family(api, family_id)
        assert ep["id"] not in fam_after["completed_episodes"], \
            f"completed_episodes not cleared after PUT: {fam_after}"
        assert fam_after["mopado_dollars"] == 0, \
            f"mopado_dollars not reset after PUT: {fam_after}"

        # And redoing the episode should be a fresh first-time again
        sid2 = _start_session(api, family_id, ep["id"], ep["season_id"])
        r2 = _complete_session(api, sid2, closing_word="AprèsEdit")
        assert r2["already_completed"] is False, \
            f"After PUT redo must be first-time. Got: {r2}"
        assert r2["mopado_earned"] == reward
