import os
from backend.knowledge_base import ingest_all_documents

# This forces Python to look in the exact same folder where this script lives
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(BASE_DIR, "docs")

if not os.path.exists(DOCS_DIR):
    os.makedirs(DOCS_DIR)

print(f"Starting manual database build using folder: {DOCS_DIR}")
ingest_all_documents(DOCS_DIR)
print("Done! Your FastAPI server will now use this saved database.")