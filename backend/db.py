import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "QaCopilotDev")

# Initialize MongoDB Client
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
users_collection = db["users"]

print(f"[INFO] Connected to MongoDB Database: [ {DB_NAME} ]")

def db_load_users():
    """Loads all registered users and their tokens from MongoDB as a dictionary."""
    users_dict = {}
    for doc in users_collection.find():
        username = doc.get("username")
        token = doc.get("api_token")
        if username and token:
            users_dict[username] = token
    return users_dict

def db_save_user(username: str, api_token: str):
    """Saves or updates a user profile and token in MongoDB."""
    users_collection.update_one(
        {"username": username},
        {"$set": {"api_token": api_token}},
        upsert=True
    )