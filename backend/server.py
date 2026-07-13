from fastapi import FastAPI, APIRouter, HTTPException, status
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from passlib.context import CryptContext
from bson import ObjectId
import jwt
from jwt.exceptions import InvalidTokenError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "mopado-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 43200  # 30 days

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Helper function for ObjectId
def str_object_id(obj):
    if isinstance(obj, dict):
        return {k: str(v) if isinstance(v, ObjectId) else str_object_id(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [str_object_id(item) for item in obj]
    return obj

# ==================== MODELS ====================

# User/Family Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    family_name: str
    nb_children: int
    children_ages: List[int]

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class FamilyProfile(BaseModel):
    email: str
    family_name: str
    nb_children: int
    children_ages: List[int]
    mopado_dollars: int = 0
    badges: List[str] = []
    completed_episodes: List[str] = []

# Season Models
class Season(BaseModel):
    name: str
    description: str
    image_base64: Optional[str] = None
    order: int
    episodes: List[str] = []

class SeasonCreate(BaseModel):
    name: str
    description: str
    image_base64: Optional[str] = None
    order: int

# Episode Models
class Card(BaseModel):
    type: str  # "question", "activity", etc.
    content: str

class MiniGame(BaseModel):
    name: str
    instructions: str
    data: Optional[Dict[str, Any]] = None  # Pour les données spécifiques (ex: lettres tirées)

class Episode(BaseModel):
    season_id: str
    title: str
    description: str
    video_base64: Optional[str] = None
    order: int
    cards: List[Card] = []
    mini_game: Optional[MiniGame] = None
    mopado_reward: int = 5

class EpisodeCreate(BaseModel):
    season_id: str
    title: str
    description: str
    video_base64: Optional[str] = None
    order: int
    cards: List[Card] = []
    mini_game: Optional[MiniGame] = None
    mopado_reward: int = 5

# Session Models
class SessionStart(BaseModel):
    family_id: str
    episode_id: str
    season_id: str

class SessionComplete(BaseModel):
    closing_word: str

class Session(BaseModel):
    family_id: str
    episode_id: str
    season_id: str
    date: datetime = Field(default_factory=datetime.utcnow)
    completed: bool = False
    time_spent: int = 0  # en secondes
    closing_word: Optional[str] = None

# Badge Models
class Badge(BaseModel):
    name: str
    description: str
    image_base64: Optional[str] = None
    criteria: str

class BadgeCreate(BaseModel):
    name: str
    description: str
    image_base64: Optional[str] = None
    criteria: str

# ==================== AUTH FUNCTIONS ====================

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_password = get_password_hash(user.password)
    user_dict = {
        "email": user.email,
        "password": hashed_password,
        "family_name": user.family_name,
        "nb_children": user.nb_children,
        "children_ages": user.children_ages,
        "mopado_dollars": 0,
        "badges": [],
        "completed_episodes": [],
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # Create token
    token = create_access_token({"sub": user_id, "email": user.email})
    
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user.email,
            "family_name": user.family_name,
            "nb_children": user.nb_children,
            "children_ages": user.children_ages,
            "mopado_dollars": 0,
            "badges": [],
            "completed_episodes": []
        }
    }

@api_router.post("/auth/login")
async def login(user: UserLogin):
    db_user = await db.users.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_id = str(db_user["_id"])
    token = create_access_token({"sub": user_id, "email": user.email})
    
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": db_user["email"],
            "family_name": db_user["family_name"],
            "nb_children": db_user["nb_children"],
            "children_ages": db_user["children_ages"],
            "mopado_dollars": db_user.get("mopado_dollars", 0),
            "badges": db_user.get("badges", []),
            "completed_episodes": db_user.get("completed_episodes", [])
        }
    }

@api_router.post("/auth/forgot-password")
async def forgot_password(email: EmailStr):
    # Pour la V1, on retourne juste un message de succès
    # Dans une vraie app, on enverrait un email
    user = await db.users.find_one({"email": email})
    if not user:
        # Pour la sécurité, on ne dit pas si l'email existe ou non
        return {"message": "If this email exists, a reset link has been sent"}
    
    return {"message": "If this email exists, a reset link has been sent"}

# ==================== FAMILY ROUTES ====================

@api_router.get("/family/{user_id}")
async def get_family_profile(user_id: str):
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "family_name": user["family_name"],
            "nb_children": user["nb_children"],
            "children_ages": user["children_ages"],
            "mopado_dollars": user.get("mopado_dollars", 0),
            "badges": user.get("badges", []),
            "completed_episodes": user.get("completed_episodes", [])
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/family/{user_id}")
async def update_family_profile(user_id: str, profile: dict):
    try:
        update_data = {}
        if "family_name" in profile:
            update_data["family_name"] = profile["family_name"]
        if "nb_children" in profile:
            update_data["nb_children"] = profile["nb_children"]
        if "children_ages" in profile:
            update_data["children_ages"] = profile["children_ages"]
        
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
        
        return {"message": "Profile updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== SEASON ROUTES ====================

@api_router.get("/seasons")
async def get_seasons():
    seasons = await db.seasons.find().sort("order", 1).to_list(100)
    return [str_object_id({**s, "id": str(s["_id"])}) for s in seasons]

@api_router.get("/seasons/{season_id}")
async def get_season(season_id: str):
    try:
        season = await db.seasons.find_one({"_id": ObjectId(season_id)})
        if not season:
            raise HTTPException(status_code=404, detail="Season not found")
        return str_object_id({**season, "id": str(season["_id"])})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/seasons")
async def create_season(season: SeasonCreate):
    season_dict = season.dict()
    result = await db.seasons.insert_one(season_dict)
    return {"id": str(result.inserted_id), "message": "Season created"}

@api_router.put("/seasons/{season_id}")
async def update_season(season_id: str, season: SeasonCreate):
    try:
        await db.seasons.update_one(
            {"_id": ObjectId(season_id)},
            {"$set": season.dict()}
        )
        return {"message": "Season updated"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/seasons/{season_id}")
async def delete_season(season_id: str):
    try:
        await db.seasons.delete_one({"_id": ObjectId(season_id)})
        await db.episodes.delete_many({"season_id": season_id})
        return {"message": "Season deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== EPISODE ROUTES ====================

@api_router.get("/episodes/season/{season_id}")
async def get_episodes_by_season(season_id: str):
    episodes = await db.episodes.find({"season_id": season_id}).sort("order", 1).to_list(100)
    return [str_object_id({**e, "id": str(e["_id"])}) for e in episodes]

@api_router.get("/episodes/{episode_id}")
async def get_episode(episode_id: str):
    try:
        episode = await db.episodes.find_one({"_id": ObjectId(episode_id)})
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found")
        return str_object_id({**episode, "id": str(episode["_id"])})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/episodes")
async def create_episode(episode: EpisodeCreate):
    episode_dict = episode.dict()
    result = await db.episodes.insert_one(episode_dict)
    return {"id": str(result.inserted_id), "message": "Episode created"}

@api_router.put("/episodes/{episode_id}")
async def update_episode(episode_id: str, episode: EpisodeCreate):
    try:
        await db.episodes.update_one(
            {"_id": ObjectId(episode_id)},
            {"$set": episode.dict()}
        )
        return {"message": "Episode updated"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/episodes/{episode_id}")
async def delete_episode(episode_id: str):
    try:
        await db.episodes.delete_one({"_id": ObjectId(episode_id)})
        return {"message": "Episode deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== SESSION ROUTES ====================

@api_router.post("/sessions/start")
async def start_session(session_data: SessionStart):
    session_dict = {
        "family_id": session_data.family_id,
        "episode_id": session_data.episode_id,
        "season_id": session_data.season_id,
        "date": datetime.utcnow(),
        "completed": False,
        "time_spent": 0,
        "closing_word": None,
        "start_time": datetime.utcnow()
    }
    
    result = await db.sessions.insert_one(session_dict)
    return {"session_id": str(result.inserted_id), "message": "Session started"}

@api_router.put("/sessions/{session_id}/complete")
async def complete_session(session_id: str, data: SessionComplete):
    try:
        session = await db.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Calculate time spent
        start_time = session.get("start_time", datetime.utcnow())
        time_spent = int((datetime.utcnow() - start_time).total_seconds())
        
        # Update session
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "completed": True,
                "closing_word": data.closing_word,
                "time_spent": time_spent
            }}
        )
        
        # Get episode to know reward amount
        episode = await db.episodes.find_one({"_id": ObjectId(session["episode_id"])})
        mopado_reward = episode.get("mopado_reward", 5) if episode else 5
        
        # Update user progress
        family_id = session["family_id"]
        episode_id = session["episode_id"]
        
        await db.users.update_one(
            {"_id": ObjectId(family_id)},
            {
                "$inc": {"mopado_dollars": mopado_reward},
                "$addToSet": {"completed_episodes": episode_id}
            }
        )
        
        return {
            "message": "Session completed",
            "mopado_earned": mopado_reward
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/sessions/family/{family_id}")
async def get_family_sessions(family_id: str):
    sessions = await db.sessions.find({"family_id": family_id}).sort("date", -1).to_list(100)
    return [str_object_id({**s, "id": str(s["_id"])}) for s in sessions]

# ==================== BADGE ROUTES ====================

@api_router.get("/badges")
async def get_badges():
    badges = await db.badges.find().to_list(100)
    return [str_object_id({**b, "id": str(b["_id"])}) for b in badges]

@api_router.post("/badges")
async def create_badge(badge: BadgeCreate):
    badge_dict = badge.dict()
    result = await db.badges.insert_one(badge_dict)
    return {"id": str(result.inserted_id), "message": "Badge created"}

@api_router.delete("/badges/{badge_id}")
async def delete_badge(badge_id: str):
    try:
        await db.badges.delete_one({"_id": ObjectId(badge_id)})
        return {"message": "Badge deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== PROGRESS ROUTES ====================

@api_router.get("/progress/{family_id}")
async def get_family_progress(family_id: str):
    try:
        user = await db.users.find_one({"_id": ObjectId(family_id)})
        if not user:
            raise HTTPException(status_code=404, detail="Family not found")
        
        # Get completed sessions with closing words
        sessions = await db.sessions.find({
            "family_id": family_id,
            "completed": True
        }).sort("date", -1).to_list(100)
        
        closing_words_history = []
        for session in sessions:
            if session.get("closing_word"):
                episode = await db.episodes.find_one({"_id": ObjectId(session["episode_id"])})
                closing_words_history.append({
                    "date": session["date"].isoformat(),
                    "episode_title": episode.get("title", "Episode") if episode else "Episode",
                    "closing_word": session["closing_word"]
                })
        
        return {
            "mopado_dollars": user.get("mopado_dollars", 0),
            "badges": user.get("badges", []),
            "completed_episodes": user.get("completed_episodes", []),
            "closing_words_history": closing_words_history,
            "total_sessions": len(sessions)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== ADMIN STATS ====================

@api_router.get("/admin/stats")
async def get_admin_stats():
    total_families = await db.users.count_documents({})
    total_seasons = await db.seasons.count_documents({})
    total_episodes = await db.episodes.count_documents({})
    total_sessions = await db.sessions.count_documents({"completed": True})
    
    return {
        "total_families": total_families,
        "total_seasons": total_seasons,
        "total_episodes": total_episodes,
        "total_completed_sessions": total_sessions
    }

# Serve admin interface
@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    admin_path = ROOT_DIR / "admin.html"
    with open(admin_path, "r", encoding="utf-8") as f:
        return f.read()

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
