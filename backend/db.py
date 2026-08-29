import os
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