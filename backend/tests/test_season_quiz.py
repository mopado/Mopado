"""
Backend tests for Phase 3 Season Quiz feature.

Covers:
- Contract of GET /api/seasons/{id}/quiz (with and without family_id)
- Availability computation: has_quiz, is_published, within_window, days_remaining,
  already_taken, available, can_take, total_expected, total_episodes_in_season,
  family_completed_in_season
- POST /api/seasons/{id}/quiz/complete scoring (MCQ, True/False, Ranking)
- +2 Mopado$ per correct answer
- Badge awarded when ratio > 0.6 (using >, not >=; matches server implementation)
- Idempotence (already_taken on repeated POST)
- Wrong-answers path (0 Mopado$, no badge, passing: false)
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to the frontend .env value shipped with the app
    from dotenv import dotenv_values
    BASE_URL = dotenv_values("/app/frontend/.env").get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "mopado_db")

SEASON_ID = "6a78e7a45f87998d7ed8e2c3"  # "Saison test"
QZU_EMAIL = "qzu-e17099@t.fr"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def season_episodes(db):
    ids = [str(e["_id"]) for e in db.episodes.find({"season_id": SEASON_ID})]
    return ids


def _register(api, prefix="quiztest"):
    """Register a fresh family and return the user dict from /register."""
    email = f"TEST_{prefix}-{uuid.uuid4().hex[:8]}@t.fr"
    r = api.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "test1234",
        "family_name": "TEST Quiz",
        "nb_children": 1,
        "children_ages": [10],
    })
    assert r.status_code == 200, r.text
    return r.json()["user"]


def _mark_episodes_completed(db, user_id, episode_ids):
    db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$addToSet": {"completed_episodes": {"$each": episode_ids}}},
    )


def _cleanup_user(db, user_id):
    db.users.delete_one({"_id": ObjectId(user_id)})


# ---------- Contract & Availability ----------

class TestQuizAvailability:
    """GET /api/seasons/{id}/quiz shape and availability logic"""

    def test_get_quiz_no_family(self, api):
        """Anonymous fetch — returns quiz + availability but already_taken=false"""
        r = api.get(f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("quiz_badge_name") == "Champion saison test"
        av = data["availability"]
        assert av["has_quiz"] is True
        assert av["is_published"] is True
        assert av["within_window"] is True
        assert 0 <= av["days_remaining"] <= 7
        assert av["already_taken"] is False
        assert av["total_expected"] == 2
        assert "total_episodes_in_season" in av
        # Anonymous → family_completed_in_season = 0 → can_take = False
        assert av["can_take"] is False

    def test_get_quiz_for_completed_family(self, api, db):
        """qzu account has completed all episodes → can_take should be True"""
        user = db.users.find_one({"email": QZU_EMAIL})
        assert user, "seed user qzu-e17099@t.fr missing"
        fid = str(user["_id"])
        r = api.get(f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz", params={"family_id": fid})
        assert r.status_code == 200, r.text
        av = r.json()["availability"]
        # If qzu has already completed the quiz from a prior run, can_take can be False.
        # Both cases are valid but we still expect has_quiz + is_published + within_window.
        assert av["has_quiz"] is True
        assert av["is_published"] is True
        assert av["within_window"] is True
        assert av["days_remaining"] <= 7
        assert av["family_completed_in_season"] >= av["total_expected"]
        if av["already_taken"]:
            assert av["can_take"] is False
        else:
            assert av["can_take"] is True

    def test_get_quiz_for_fresh_family(self, api, db):
        """Freshly registered family — can_take = false but has_quiz stays true"""
        user = _register(api, "fresh")
        try:
            r = api.get(f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz", params={"family_id": user["id"]})
            assert r.status_code == 200, r.text
            av = r.json()["availability"]
            assert av["has_quiz"] is True
            assert av["is_published"] is True
            assert av["already_taken"] is False
            assert av["family_completed_in_season"] == 0
            assert av["can_take"] is False
        finally:
            _cleanup_user(db, user["id"])


# ---------- Completion / Scoring ----------

class TestQuizCompletion:
    """POST /api/seasons/{id}/quiz/complete scoring and rewards"""

    def test_all_correct_awards_mopado_and_badge(self, api, db, season_episodes):
        user = _register(api, "correct")
        try:
            _mark_episodes_completed(db, user["id"], season_episodes[:2])

            # Correct answers based on seeded quiz:
            # Q1 MCQ 2+2 → index 1 ("4")
            # Q2 T/F sky is blue → true
            # Q3 Ranking → [0,1,2,3]
            answers = [1, True, [0, 1, 2, 3]]
            r = api.post(
                f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz/complete",
                json={"family_id": user["id"], "answers": answers},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["already_taken"] is False
            assert data["mopado_earned"] == 6, data
            assert data["passing"] is True
            assert data["badge_earned"] == "Champion saison test"
            assert data["score"]["correct_count"] == 3
            assert data["score"]["total"] == 3

            # Verify persistence
            u = db.users.find_one({"_id": ObjectId(user["id"])})
            assert u["mopado_dollars"] == 6
            assert "Champion saison test" in (u.get("badges") or [])
            assert SEASON_ID in (u.get("completed_quizzes") or [])

            # Second call → already_taken, no additional reward
            r2 = api.post(
                f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz/complete",
                json={"family_id": user["id"], "answers": answers},
            )
            assert r2.status_code == 200
            d2 = r2.json()
            assert d2["already_taken"] is True
            assert d2["mopado_earned"] == 0
            assert d2["badge_earned"] is None

            u2 = db.users.find_one({"_id": ObjectId(user["id"])})
            assert u2["mopado_dollars"] == 6  # unchanged
        finally:
            _cleanup_user(db, user["id"])

    def test_all_wrong_no_reward(self, api, db, season_episodes):
        user = _register(api, "wrong")
        try:
            _mark_episodes_completed(db, user["id"], season_episodes[:2])

            # Wrong answers:
            #   MCQ pick "3" (index 0) — wrong (correct is 1)
            #   T/F pick False — wrong (correct is True)
            #   Ranking pick [3,2,1,0] — wrong (correct is [0,1,2,3])
            answers = [0, False, [3, 2, 1, 0]]
            r = api.post(
                f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz/complete",
                json={"family_id": user["id"], "answers": answers},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["mopado_earned"] == 0
            assert data["passing"] is False
            assert data["badge_earned"] is None
            assert data["score"]["correct_count"] == 0

            u = db.users.find_one({"_id": ObjectId(user["id"])})
            assert u["mopado_dollars"] == 0
            assert "Champion saison test" not in (u.get("badges") or [])
            # Even wrong completion still marks completed_quizzes (idempotence for the season)
            assert SEASON_ID in (u.get("completed_quizzes") or [])
        finally:
            _cleanup_user(db, user["id"])

    def test_partial_correct_scoring(self, api, db, season_episodes):
        """2/3 correct → 66.7% > 60% → passing + badge, +4 Mopado$"""
        user = _register(api, "partial")
        try:
            _mark_episodes_completed(db, user["id"], season_episodes[:2])

            # 2 correct, 1 wrong (ranking wrong)
            answers = [1, True, [3, 2, 1, 0]]
            r = api.post(
                f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz/complete",
                json={"family_id": user["id"], "answers": answers},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["mopado_earned"] == 4
            assert data["score"]["correct_count"] == 2
            # ratio = 2/3 = 0.666..., > 0.6 → passing
            assert data["passing"] is True
            assert data["badge_earned"] == "Champion saison test"
        finally:
            _cleanup_user(db, user["id"])

    def test_one_correct_below_threshold(self, api, db, season_episodes):
        """1/3 correct → 33% < 60% → not passing, no badge, +2 Mopado$"""
        user = _register(api, "one")
        try:
            _mark_episodes_completed(db, user["id"], season_episodes[:2])

            answers = [1, False, [3, 2, 1, 0]]
            r = api.post(
                f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz/complete",
                json={"family_id": user["id"], "answers": answers},
            )
            assert r.status_code == 200
            data = r.json()
            assert data["mopado_earned"] == 2
            assert data["passing"] is False
            assert data["badge_earned"] is None
        finally:
            _cleanup_user(db, user["id"])


# ---------- Upsert (admin PUT) ----------

class TestQuizUpsertAdmin:
    """PUT /api/seasons/{id}/quiz — save-only vs publish"""

    def test_save_without_publish_preserves_content(self, api, db):
        # Snapshot original
        original = db.seasons.find_one({"_id": ObjectId(SEASON_ID)})
        orig_quiz = original.get("quiz")
        orig_badge = original.get("quiz_badge_name")
        orig_published_at = original.get("quiz_published_at")

        # Save without publish
        payload = {
            "questions": orig_quiz["questions"],
            "badge_name": orig_badge,
            "badge_description": original.get("quiz_badge_description") or "",
            "publish": False,
        }
        r = api.put(f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["published"] is False

        # published_at should be unchanged
        after = db.seasons.find_one({"_id": ObjectId(SEASON_ID)})
        assert after.get("quiz_published_at") == orig_published_at

    def test_republish_updates_published_at(self, api, db):
        original = db.seasons.find_one({"_id": ObjectId(SEASON_ID)})
        orig_published_at = original.get("quiz_published_at")

        payload = {
            "questions": original["quiz"]["questions"],
            "badge_name": original.get("quiz_badge_name"),
            "badge_description": original.get("quiz_badge_description") or "",
            "publish": True,
        }
        r = api.put(f"{BASE_URL}/api/seasons/{SEASON_ID}/quiz", json=payload)
        assert r.status_code == 200
        assert r.json()["published"] is True

        after = db.seasons.find_one({"_id": ObjectId(SEASON_ID)})
        assert after["quiz_published_at"] is not None
        # New time should be >= original (typically strictly newer)
        assert after["quiz_published_at"] >= orig_published_at
