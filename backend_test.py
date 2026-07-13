#!/usr/bin/env python3
"""
Mopado Backend API Test Suite
Tests all backend endpoints for the Mopado family app
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://mopado-family-1.preview.emergentagent.com/api"

# Test data storage
test_data = {
    "token": None,
    "user_id": None,
    "family_id": None,
    "season_id": None,
    "episode_id": None,
    "session_id": None
}

# Test results
test_results = {
    "passed": 0,
    "failed": 0,
    "errors": []
}

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {test_name}")
    if details:
        print(f"   Details: {details}")
    
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{test_name}: {details}")

def print_response(response):
    """Print response details"""
    print(f"   Status: {response.status_code}")
    try:
        print(f"   Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"   Response: {response.text}")

# ==================== TEST 1: AUTHENTICATION ====================

def test_register():
    """Test user registration"""
    print("\n" + "="*60)
    print("TEST 1: User Registration")
    print("="*60)
    
    url = f"{BACKEND_URL}/auth/register"
    payload = {
        "email": "famille.test@mopado.fr",
        "password": "test123",
        "family_name": "Famille Test",
        "nb_children": 2,
        "children_ages": [10, 12]
    }
    
    try:
        response = requests.post(url, json=payload)
        print_response(response)
        
        if response.status_code in [200, 201]:
            data = response.json()
            if "token" in data and "user" in data:
                test_data["token"] = data["token"]
                test_data["user_id"] = data["user"]["id"]
                test_data["family_id"] = data["user"]["id"]
                log_test("Register User", True, f"User ID: {test_data['user_id']}")
                return True
            else:
                log_test("Register User", False, "Missing token or user in response")
                return False
        else:
            log_test("Register User", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Register User", False, f"Exception: {str(e)}")
        return False

def test_login():
    """Test user login"""
    print("\n" + "="*60)
    print("TEST 2: User Login")
    print("="*60)
    
    url = f"{BACKEND_URL}/auth/login"
    payload = {
        "email": "famille.test@mopado.fr",
        "password": "test123"
    }
    
    try:
        response = requests.post(url, json=payload)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                test_data["token"] = data["token"]
                test_data["user_id"] = data["user"]["id"]
                log_test("Login User", True, f"Token received")
                return True
            else:
                log_test("Login User", False, "Missing token or user in response")
                return False
        else:
            log_test("Login User", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Login User", False, f"Exception: {str(e)}")
        return False

# ==================== TEST 2: SEASONS ====================

def test_create_season():
    """Test season creation"""
    print("\n" + "="*60)
    print("TEST 3: Create Season")
    print("="*60)
    
    url = f"{BACKEND_URL}/seasons"
    payload = {
        "name": "Estime de soi",
        "description": "Découvrir et renforcer la confiance en soi",
        "order": 1
    }
    
    try:
        response = requests.post(url, json=payload)
        print_response(response)
        
        if response.status_code in [200, 201]:
            data = response.json()
            if "id" in data:
                test_data["season_id"] = data["id"]
                log_test("Create Season", True, f"Season ID: {test_data['season_id']}")
                return True
            else:
                log_test("Create Season", False, "Missing id in response")
                return False
        else:
            log_test("Create Season", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Create Season", False, f"Exception: {str(e)}")
        return False

def test_get_seasons():
    """Test getting all seasons"""
    print("\n" + "="*60)
    print("TEST 4: Get All Seasons")
    print("="*60)
    
    url = f"{BACKEND_URL}/seasons"
    
    try:
        response = requests.get(url)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                log_test("Get Seasons", True, f"Found {len(data)} season(s)")
                return True
            else:
                log_test("Get Seasons", False, "No seasons found")
                return False
        else:
            log_test("Get Seasons", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get Seasons", False, f"Exception: {str(e)}")
        return False

# ==================== TEST 3: EPISODES ====================

def test_create_episode():
    """Test episode creation"""
    print("\n" + "="*60)
    print("TEST 5: Create Episode")
    print("="*60)
    
    if not test_data["season_id"]:
        log_test("Create Episode", False, "No season_id available")
        return False
    
    url = f"{BACKEND_URL}/episodes"
    payload = {
        "season_id": test_data["season_id"],
        "title": "Se connaître mieux",
        "description": "Un moment pour découvrir nos forces",
        "order": 1,
        "cards": [
            {
                "type": "question",
                "content": "Quelle est ta plus grande qualité ?"
            }
        ],
        "mini_game": {
            "name": "C'est quali",
            "instructions": "Trouvez une qualité pour chaque membre"
        },
        "mopado_reward": 5
    }
    
    try:
        response = requests.post(url, json=payload)
        print_response(response)
        
        if response.status_code in [200, 201]:
            data = response.json()
            if "id" in data:
                test_data["episode_id"] = data["id"]
                log_test("Create Episode", True, f"Episode ID: {test_data['episode_id']}")
                return True
            else:
                log_test("Create Episode", False, "Missing id in response")
                return False
        else:
            log_test("Create Episode", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Create Episode", False, f"Exception: {str(e)}")
        return False

def test_get_episodes_by_season():
    """Test getting episodes for a season"""
    print("\n" + "="*60)
    print("TEST 6: Get Episodes by Season")
    print("="*60)
    
    if not test_data["season_id"]:
        log_test("Get Episodes by Season", False, "No season_id available")
        return False
    
    url = f"{BACKEND_URL}/episodes/season/{test_data['season_id']}"
    
    try:
        response = requests.get(url)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                log_test("Get Episodes by Season", True, f"Found {len(data)} episode(s)")
                return True
            else:
                log_test("Get Episodes by Season", False, "No episodes found")
                return False
        else:
            log_test("Get Episodes by Season", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get Episodes by Season", False, f"Exception: {str(e)}")
        return False

# ==================== TEST 4: SESSIONS ====================

def test_start_session():
    """Test starting a session"""
    print("\n" + "="*60)
    print("TEST 7: Start Session")
    print("="*60)
    
    if not test_data["family_id"] or not test_data["episode_id"] or not test_data["season_id"]:
        log_test("Start Session", False, "Missing required IDs")
        return False
    
    url = f"{BACKEND_URL}/sessions/start"
    payload = {
        "family_id": test_data["family_id"],
        "episode_id": test_data["episode_id"],
        "season_id": test_data["season_id"]
    }
    
    try:
        response = requests.post(url, json=payload)
        print_response(response)
        
        if response.status_code in [200, 201]:
            data = response.json()
            if "session_id" in data:
                test_data["session_id"] = data["session_id"]
                log_test("Start Session", True, f"Session ID: {test_data['session_id']}")
                return True
            else:
                log_test("Start Session", False, "Missing session_id in response")
                return False
        else:
            log_test("Start Session", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Start Session", False, f"Exception: {str(e)}")
        return False

def test_complete_session():
    """Test completing a session"""
    print("\n" + "="*60)
    print("TEST 8: Complete Session")
    print("="*60)
    
    if not test_data["session_id"]:
        log_test("Complete Session", False, "No session_id available")
        return False
    
    url = f"{BACKEND_URL}/sessions/{test_data['session_id']}/complete"
    payload = {
        "closing_word": "Merveilleux"
    }
    
    try:
        response = requests.put(url, json=payload)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if "mopado_earned" in data:
                log_test("Complete Session", True, f"Earned {data['mopado_earned']} Mopado dollars")
                return True
            else:
                log_test("Complete Session", False, "Missing mopado_earned in response")
                return False
        else:
            log_test("Complete Session", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Complete Session", False, f"Exception: {str(e)}")
        return False

def test_get_family_sessions():
    """Test getting family sessions"""
    print("\n" + "="*60)
    print("TEST 9: Get Family Sessions")
    print("="*60)
    
    if not test_data["family_id"]:
        log_test("Get Family Sessions", False, "No family_id available")
        return False
    
    url = f"{BACKEND_URL}/sessions/family/{test_data['family_id']}"
    
    try:
        response = requests.get(url)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                log_test("Get Family Sessions", True, f"Found {len(data)} session(s)")
                return True
            else:
                log_test("Get Family Sessions", False, "No sessions found")
                return False
        else:
            log_test("Get Family Sessions", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get Family Sessions", False, f"Exception: {str(e)}")
        return False

# ==================== TEST 5: PROGRESS ====================

def test_get_progress():
    """Test getting family progress"""
    print("\n" + "="*60)
    print("TEST 10: Get Family Progress")
    print("="*60)
    
    if not test_data["family_id"]:
        log_test("Get Family Progress", False, "No family_id available")
        return False
    
    url = f"{BACKEND_URL}/progress/{test_data['family_id']}"
    
    try:
        response = requests.get(url)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify expected data
            checks = []
            
            # Check mopado_dollars
            if data.get("mopado_dollars") == 5:
                checks.append("✓ Mopado dollars = 5")
            else:
                checks.append(f"✗ Mopado dollars = {data.get('mopado_dollars')} (expected 5)")
            
            # Check completed_episodes
            if test_data["episode_id"] in data.get("completed_episodes", []):
                checks.append("✓ Episode marked as completed")
            else:
                checks.append("✗ Episode not in completed list")
            
            # Check closing_words_history
            closing_words = data.get("closing_words_history", [])
            if len(closing_words) > 0 and any(cw.get("closing_word") == "Merveilleux" for cw in closing_words):
                checks.append("✓ Closing word 'Merveilleux' found")
            else:
                checks.append("✗ Closing word 'Merveilleux' not found")
            
            all_passed = all("✓" in check for check in checks)
            details = "\n   " + "\n   ".join(checks)
            
            log_test("Get Family Progress", all_passed, details)
            return all_passed
        else:
            log_test("Get Family Progress", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get Family Progress", False, f"Exception: {str(e)}")
        return False

# ==================== TEST 6: FAMILY PROFILE ====================

def test_get_family_profile():
    """Test getting family profile"""
    print("\n" + "="*60)
    print("TEST 11: Get Family Profile")
    print("="*60)
    
    if not test_data["user_id"]:
        log_test("Get Family Profile", False, "No user_id available")
        return False
    
    url = f"{BACKEND_URL}/family/{test_data['user_id']}"
    
    try:
        response = requests.get(url)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify mopado_dollars was updated
            if data.get("mopado_dollars") == 5:
                log_test("Get Family Profile", True, "Mopado dollars correctly updated to 5")
                return True
            else:
                log_test("Get Family Profile", False, f"Mopado dollars = {data.get('mopado_dollars')} (expected 5)")
                return False
        else:
            log_test("Get Family Profile", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Get Family Profile", False, f"Exception: {str(e)}")
        return False

# ==================== TEST 7: ADMIN STATS ====================

def test_admin_stats():
    """Test admin stats endpoint"""
    print("\n" + "="*60)
    print("TEST 12: Admin Stats")
    print("="*60)
    
    url = f"{BACKEND_URL}/admin/stats"
    
    try:
        response = requests.get(url)
        print_response(response)
        
        if response.status_code == 200:
            data = response.json()
            
            # Verify expected stats
            checks = []
            
            if data.get("total_families", 0) >= 1:
                checks.append(f"✓ Total families = {data.get('total_families')}")
            else:
                checks.append(f"✗ Total families = {data.get('total_families')} (expected >= 1)")
            
            if data.get("total_seasons", 0) >= 1:
                checks.append(f"✓ Total seasons = {data.get('total_seasons')}")
            else:
                checks.append(f"✗ Total seasons = {data.get('total_seasons')} (expected >= 1)")
            
            if data.get("total_episodes", 0) >= 1:
                checks.append(f"✓ Total episodes = {data.get('total_episodes')}")
            else:
                checks.append(f"✗ Total episodes = {data.get('total_episodes')} (expected >= 1)")
            
            if data.get("total_completed_sessions", 0) >= 1:
                checks.append(f"✓ Total completed sessions = {data.get('total_completed_sessions')}")
            else:
                checks.append(f"✗ Total completed sessions = {data.get('total_completed_sessions')} (expected >= 1)")
            
            all_passed = all("✓" in check for check in checks)
            details = "\n   " + "\n   ".join(checks)
            
            log_test("Admin Stats", all_passed, details)
            return all_passed
        else:
            log_test("Admin Stats", False, f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("Admin Stats", False, f"Exception: {str(e)}")
        return False

# ==================== RUN ALL TESTS ====================

def run_all_tests():
    """Run all tests in sequence"""
    print("\n" + "="*60)
    print("MOPADO BACKEND API TEST SUITE")
    print("="*60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test started at: {datetime.now().isoformat()}")
    
    # Run tests in order
    test_register()
    test_login()
    test_create_season()
    test_get_seasons()
    test_create_episode()
    test_get_episodes_by_season()
    test_start_session()
    test_complete_session()
    test_get_family_sessions()
    test_get_progress()
    test_get_family_profile()
    test_admin_stats()
    
    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Total Tests: {test_results['passed'] + test_results['failed']}")
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    
    if test_results["failed"] > 0:
        print("\n" + "="*60)
        print("FAILED TESTS:")
        print("="*60)
        for error in test_results["errors"]:
            print(f"  • {error}")
    
    print("\n" + "="*60)
    print(f"Test completed at: {datetime.now().isoformat()}")
    print("="*60)
    
    # Return exit code
    return 0 if test_results["failed"] == 0 else 1

if __name__ == "__main__":
    exit_code = run_all_tests()
    sys.exit(exit_code)
