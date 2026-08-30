import os
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
from cryptography.fernet import Fernet

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "QaCopilotDev")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

# Initialize Fernet Cipher suite if the key exists
cipher = Fernet(ENCRYPTION_KEY.encode()) if ENCRYPTION_KEY else None

# Initialize MongoDB Client
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
users_collection = db["users"]
bugs_collection = db["bug_history"]      # Collection for tracking priority counts
tickets_collection = db["tickets_history"] # New collection for full ticket history feed

print(f"[INFO] Connected to MongoDB Database: [ {DB_NAME} ]")

def db_load_users():
    """Loads all registered users, decrypting tokens if encrypted, 
    and automatically migrating old plain-text tokens."""
    users_dict = {}
    for doc in users_collection.find():
        username = doc.get("username")
        token_value = doc.get("api_token")
        
        if username and token_value:
            decrypted_token = token_value
            if cipher:
                try:
                    # Attempt to decrypt (works if it's already encrypted)
                    decrypted_token = cipher.decrypt(token_value.encode()).decode()
                except Exception:
                    # If decryption fails, it's an old plain-text token!
                    # Auto-encrypt it in the database right now (Migration)
                    print(f"[INFO] Auto-migrating plain-text token for user: {username}")
                    encrypted_version = cipher.encrypt(token_value.encode()).decode()
                    users_collection.update_one(
                        {"username": username},
                        {"$set": {"api_token": encrypted_version}}
                    )
                    decrypted_token = token_value
                    
            users_dict[username] = decrypted_token
                
    return users_dict

def db_save_user(username: str, api_token: str):
    """Encrypts and saves a user profile token in MongoDB."""
    token_to_save = api_token
    if cipher:
        token_to_save = cipher.encrypt(api_token.encode()).decode()
        
    users_collection.update_one(
        {"username": username},
        {"$set": {"api_token": token_to_save}},
        upsert=True
    )

# --- BUG METRICS FUNCTIONS ---

def db_log_bug_creation(username: str, priority: str):
    """Logs a newly created bug with its priority and timestamp into MongoDB."""
    try:
        bugs_collection.insert_one({
            "username": username,
            "priority": priority.strip().lower() if priority else "normal",
            "created_at": datetime.utcnow()
        })
    except Exception as e:
        print(f"[ERROR] Failed to log bug in MongoDB: {e}")

def db_get_user_bug_stats(username: str):
    """Aggregates bug counts grouped by priority for a specific user from MongoDB."""
    try:
        pipeline = [
            {"$match": {"username": username}},
            {"$group": {"_id": "$priority", "count": {"$sum": 1}}}
        ]
        results = list(bugs_collection.aggregate(pipeline))
        stats = {item["_id"].upper(): item["count"] for item in results if item["_id"]}
        return stats
    except Exception as e:
        print(f"[ERROR] Failed to fetch bug stats from MongoDB: {e}")
        return {}

# --- NEW FULL TICKET HISTORY FUNCTIONS ---

def db_save_ticket(ticket_data: dict):
    """Saves a complete ticket record (summary, priority, URL, etc.) into MongoDB."""
    try:
        tickets_collection.insert_one(ticket_data)
    except Exception as e:
        print(f"[ERROR] Failed to save ticket history in MongoDB: {e}")

def db_get_tickets():
    """Retrieves all stored ticket records from MongoDB, newest first."""
    try:
        cursor = tickets_collection.find().sort("_id", -1)
        tickets = []
        for doc in cursor:
            # Convert MongoDB ObjectId to string for JSON serialization compatibility
            doc["_id"] = str(doc["_id"])
            tickets.append(doc)
        return tickets
    except Exception as e:
        print(f"[ERROR] Failed to fetch tickets from MongoDB: {e}")
        return []