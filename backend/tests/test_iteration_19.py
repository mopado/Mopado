"""
Iteration 19 backend tests.

Coverage:
- /api/progress/{family_id} returns `completed_seasons` (int).
- completed_seasons increments when a family completes enough episodes of a season.
- Season quiz backend still accepts a variable-length ranking answer list.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mopado-family-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register_family(api_client, suffix=""):
    email = f"TEST_it19_{suffix}_{uuid.uuid4().hex[:6]}@mopado.fr"
    payload = {
        "email": email,
        "password": "test1234",
        "family_name": f"TEST_it19_{suffix}",
        "nb_children": 2,
        "children_ages": [10, 12],
    }
    r = api_client.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["user"]["id"], email


# ---------- Tests: progress endpoint ----------
class TestProgressCompletedSeasons:
    def test_progress_returns_completed_seasons_field(self, api_client):
        fid, _ = _register_family(api_client, "prog0")
        r = api_client.get(f"{API}/progress/{fid}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "completed_seasons" in data
        assert isinstance(data["completed_seasons"], int)
        assert data["completed_seasons"] == 0

    def test_progress_famille_test_completed_seasons_int(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={
            "email": "famille.test@mopado.fr",
            "password": "test123",
        })
        assert r.status_code == 200, r.text
        fid = r.json()["user"]["id"]
        pr = api_client.get(f"{API}/progress/{fid}")
        assert pr.status_code == 200
        data = pr.json()
        assert "completed_seasons" in data
        assert isinstance(data["completed_seasons"], int)
        for key in ("mopado_dollars", "badges", "completed_episodes", "total_sessions"):
            assert key in data
        print(f"[famille.test] progress={data.get('completed_seasons')} completed_ep={len(data.get('completed_episodes',[]))} sessions={data.get('total_sessions')}")

    def test_completed_seasons_increments_when_all_episodes_done(self, api_client):
        """Register a family, complete `expected_episodes` episodes of any
        season → completed_seasons should be >= 1."""
        fid, _ = _register_family(api_client, "sfull")

        rs = api_client.get(f"{API}/seasons")
        assert rs.status_code == 200
        seasons = rs.json()

        target = None
        for s in seasons:
            season_id = s["id"]
            eps = api_client.get(f"{API}/episodes/season/{season_id}")
            if eps.status_code != 200:
                continue
            ep_list = eps.json()
            expected = int(s.get("expected_episodes") or 0)
            actual = len(ep_list)
            needed = min(expected, actual) if expected > 0 else actual
            if needed > 0 and actual >= needed:
                target = (s, ep_list, needed)
                break
        assert target is not None, "No suitable season with completable episodes found"
        season, eps, needed = target
        season_id = season["id"]

        # Complete `needed` FRESH sessions
        for ep in eps[:needed]:
            create = api_client.post(f"{API}/sessions/start", json={
                "family_id": fid,
                "episode_id": ep["id"],
                "season_id": season_id,
            })
            assert create.status_code == 200, create.text
            sid = create.json()["session_id"]
            complete = api_client.put(f"{API}/sessions/{sid}/complete", json={
                "closing_word": "merveilleux",
            })
            assert complete.status_code == 200, complete.text

        pr = api_client.get(f"{API}/progress/{fid}")
        assert pr.status_code == 200
        data = pr.json()
        assert data["completed_seasons"] >= 1, (
            f"Expected completed_seasons >= 1 after completing {needed} episodes of "
            f"season '{season.get('name')}', got completed_seasons={data['completed_seasons']}. "
            f"completed_episodes={data['completed_episodes']}"
        )


# ---------- Tests: quiz with dynamic ranking items ----------
class TestDynamicRankingItems:
    def _load_current_quiz(self, api_client, season_id, fid):
        r = api_client.get(f"{API}/seasons/{season_id}/quiz", params={"family_id": fid})
        if r.status_code != 200:
            return None
        return r.json()

    def _restore_quiz(self, api_client, season_id, prev_quiz):
        """Restore original quiz from previous payload."""
        if not prev_quiz:
            return
        quiz = prev_quiz.get("quiz") or {}
        prev_questions = quiz.get("questions") or []
        badge_name = prev_quiz.get("quiz_badge_name") or "restore"
        restore = {
            "questions": prev_questions,
            "badge_name": badge_name,
            "publish": False,
        }
        api_client.put(f"{API}/seasons/{season_id}/quiz", json=restore)

    def test_quiz_save_accepts_5_item_ranking(self, api_client):
        # need family_id to fetch quiz content
        fid, _ = _register_family(api_client, "rank5")

        rs = api_client.get(f"{API}/seasons")
        assert rs.status_code == 200
        seasons = rs.json()
        assert seasons, "No seasons found"
        target = seasons[0]
        season_id = target["id"]

        prev_body = self._load_current_quiz(api_client, season_id, fid)

        try:
            put_body = {
                "questions": [
                    {
                        "type": "ranking",
                        "question": "TEST_rank_5",
                        "items": ["a", "b", "c", "d", "e"],
                    }
                ],
                "badge_name": target.get("quiz_badge_name") or "TEST_badge",
                "publish": False,
            }
            put = api_client.put(f"{API}/seasons/{season_id}/quiz", json=put_body)
            assert put.status_code == 200, put.text

            # Read back the quiz via seasons list (public part) OR quiz endpoint
            rs2 = api_client.get(f"{API}/seasons")
            season2 = next((s for s in rs2.json() if s["id"] == season_id), None)
            assert season2 is not None
            questions = (season2.get("quiz") or {}).get("questions") or []
            rank_qs = [q for q in questions if q.get("type") == "ranking" and q.get("question") == "TEST_rank_5"]
            assert rank_qs, f"5-item ranking not persisted, got: {questions}"
            assert len(rank_qs[0]["items"]) == 5
        finally:
            self._restore_quiz(api_client, season_id, prev_body)

    def test_quiz_save_accepts_2_item_ranking(self, api_client):
        fid, _ = _register_family(api_client, "rank2")

        rs = api_client.get(f"{API}/seasons")
        assert rs.status_code == 200
        seasons = rs.json()
        target = seasons[0]
        season_id = target["id"]

        prev_body = self._load_current_quiz(api_client, season_id, fid)

        try:
            put_body = {
                "questions": [
                    {"type": "ranking", "question": "TEST_rank_2", "items": ["x", "y"]}
                ],
                "badge_name": target.get("quiz_badge_name") or "TEST_badge",
                "publish": False,
            }
            put = api_client.put(f"{API}/seasons/{season_id}/quiz", json=put_body)
            assert put.status_code == 200, put.text

            rs2 = api_client.get(f"{API}/seasons")
            season2 = next((s for s in rs2.json() if s["id"] == season_id), None)
            questions = (season2.get("quiz") or {}).get("questions") or []
            rank_qs = [q for q in questions if q.get("type") == "ranking" and q.get("question") == "TEST_rank_2"]
            assert rank_qs, f"2-item ranking not persisted, got: {questions}"
            assert len(rank_qs[0]["items"]) == 2
        finally:
            self._restore_quiz(api_client, season_id, prev_body)
