from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from backend.bug_generator import generate_structured_bug
from backend.clickup_client import create_task, upload_attachment, get_clickup_user_name
from backend.knowledge_base import retrieve_context, ingest_single_document
import uvicorn
import os
import re
import csv
import io
import json
import datetime

app = FastAPI(title="AI QA Copilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

USER_DB_FILE = "users_db.json"
TICKET_DB_FILE = "tickets_db.json"

def load_users():
    """Loads registered users and tokens from persistent JSON storage."""
    if os.path.exists(USER_DB_FILE):
        try:
            with open(USER_DB_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_users(users_dict):
    """Saves registered users and tokens to persistent JSON storage."""
    with open(USER_DB_FILE, "w") as f:
        json.dump(users_dict, f, indent=4)

def load_tickets():
    """Loads created ticket history from persistent JSON storage."""
    if os.path.exists(TICKET_DB_FILE):
        try:
            with open(TICKET_DB_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_ticket(ticket_data):
    """Saves a new ticket record to history."""
    tickets = load_tickets()
    tickets.insert(0, ticket_data)  # newest first
    with open(TICKET_DB_FILE, "w") as f:
        json.dump(tickets, f, indent=4)

def format_markdown_description(bug_data: dict) -> str:
    """Formats JSON bug data into clean text WITHOUT markdown symbols and double numbers."""
    repro_steps = bug_data.get('repro_steps', [])
    
    if isinstance(repro_steps, list):
        clean_steps = []
        for i, step in enumerate(repro_steps):
            cleaned_text = re.sub(r'^\s*\d+[\.\)]?\s*', '', str(step))
            clean_steps.append(f"{i+1}. {cleaned_text}")
        steps_markdown = "\n".join(clean_steps)
    else:
        steps_markdown = str(repro_steps)

    return f"""⚙️ PRECONDITIONS
{bug_data.get('preconditions', 'None')}

👣 STEPS TO REPRODUCE
{steps_markdown}

❌ ACTUAL RESULT
{bug_data.get('actual_result', 'N/A')}

✅ EXPECTED RESULT
{bug_data.get('expected_result', 'N/A')}
"""

@app.post("/api/verify-token")
async def verify_token(api_token: str = Form(...)):
    token_cleaned = api_token.strip()
    if not token_cleaned:
        return {"status": "error", "message": "API token cannot be empty."}
    
    saved_users = load_users()
    if token_cleaned in saved_users.values():
        return {"status": "error", "message": "This API token is already registered in the system!"}
        
    res = get_clickup_user_name(token_cleaned)
    if not res.get("success"):
        return {"status": "error", "message": res.get("message", "Invalid ClickUp API Token.")}
    
    username = res.get("username")
    if username in saved_users:
        return {"status": "error", "message": f"A profile for '{username}' is already registered!"}
        
    return {"status": "success", "username": username}

@app.post("/api/confirm-register-token")
async def confirm_register_token(api_token: str = Form(...), username: str = Form(...)):
    token_cleaned = api_token.strip()
    saved_users = load_users()
    
    if token_cleaned in saved_users.values() or username in saved_users:
        return {"status": "error", "message": "Profile or token already exists."}
        
    saved_users[username] = token_cleaned
    save_users(saved_users)
    return {"status": "success", "username": username}

@app.get("/api/get-users")
async def get_users():
    saved_users = load_users()
    return {"status": "success", "users": list(saved_users.keys())}

@app.get("/api/get-tickets")
async def get_tickets():
    """Returns all created ticket history for Dashboard and My Tickets."""
    tickets = load_tickets()
    return {"status": "success", "tickets": tickets}

@app.post("/api/generate-bug")
async def generate_bug_report(description: str = Form(...)):
    bug_data = generate_structured_bug(description)
    
    summary = bug_data.get("summary") or bug_data.get("title") or "New Bug Report"
    formatted_report = format_markdown_description(bug_data)

    return {
        "status": "success",
        "summary": summary,
        "priority": bug_data.get("priority", "P3"),
        "repro_rate": bug_data.get("repro_rate", "100%"),
        "generated_report": formatted_report
    }

@app.post("/api/upload-rulebook")
async def upload_rulebook(file: UploadFile = File(...)):
    os.makedirs("./docs", exist_ok=True)
    file_location = f"./docs/{file.filename}"
    
    with open(file_location, "wb+") as f:
        f.write(await file.read())
        
    success = ingest_single_document(file_location)
    
    if success:
        return {"status": "success", "message": f"Successfully learned {file.filename}!"}
    else:
        return {"status": "error", "message": "Failed to learn document. Must be .pdf or .txt."}

@app.post("/api/create-ticket")
async def create_clickup_ticket(
    summary: str = Form(...),
    report: str = Form(...),
    priority: str = Form(...),
    repro_rate: str = Form(...),
    bug_type: str = Form(...),
    created_by: str = Form(None),
    evidence: UploadFile = File(None)
):
    markdown_report = report.replace("⚙️ PRECONDITIONS", "### ⚙️ Preconditions")
    markdown_report = markdown_report.replace("👣 STEPS TO REPRODUCE", "### 👣 Steps to Reproduce")
    markdown_report = markdown_report.replace("❌ ACTUAL RESULT", "### ❌ Actual Result")
    markdown_report = markdown_report.replace("✅ EXPECTED RESULT", "### ✅ Expected Result")

    saved_users = load_users()
    user_token = saved_users.get(created_by) if created_by else None

    clickup_task = create_task(summary, markdown_report, priority, repro_rate, bug_type, api_token=user_token)
    
    if not clickup_task:
        return {"status": "error", "message": "Failed to create ClickUp ticket."}

    ticket_url = clickup_task.get('url')
    
    if evidence:
        task_id = clickup_task['id']
        file_location = f"./temp_{evidence.filename}"
        with open(file_location, "wb+") as f:
            f.write(await evidence.read())
        
        upload_attachment(task_id, file_location, api_token=user_token)
        if os.path.exists(file_location):
            os.remove(file_location)

    # Save to persistent ticket history
    ticket_record = {
        "summary": summary,
        "priority": priority,
        "bug_type": bug_type,
        "created_by": created_by or "PS QA Team",
        "url": ticket_url,
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    }
    save_ticket(ticket_record)

    return {
        "status": "success",
        "ticket_url": ticket_url
    }

@app.post("/api/bulk-upload-bugs")
async def bulk_upload_bugs(
    file: UploadFile = File(...),
    bug_type: str = Form(...),
    created_by: str = Form(None)
):
    try:
        content = await file.read()
        decoded_content = content.decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(decoded_content))
        
        created_tickets = []
        saved_users = load_users()
        user_token = saved_users.get(created_by) if created_by else None
        
        for row in reader:
            normalized_row = {k.strip().lower(): v for k, v in row.items() if k}
            
            raw_desc = normalized_row.get("description", "").strip()
            sheet_priority = normalized_row.get("priority", "P3").strip()
            
            if not raw_desc:
                continue
                
            bug_data = generate_structured_bug(raw_desc)
            
            summary = bug_data.get("summary") or bug_data.get("title") or "Bulk Imported Bug"
            repro_rate = bug_data.get("repro_rate", "100%")
            final_priority = sheet_priority if sheet_priority in ["P0", "P1", "P2", "P3", "P4", "P5"] else bug_data.get("priority", "P3")
            
            formatted_report = format_markdown_description(bug_data)
            markdown_report = formatted_report.replace("⚙️ PRECONDITIONS", "### ⚙️ Preconditions")
            markdown_report = markdown_report.replace("👣 STEPS TO REPRODUCE", "### 👣 Steps to Reproduce")
            markdown_report = markdown_report.replace("❌ ACTUAL RESULT", "### ❌ Actual Result")
            markdown_report = markdown_report.replace("✅ EXPECTED RESULT", "### ✅ Expected Result")
            
            result = create_task(
                summary=summary,
                description=markdown_report,
                priority_val=final_priority,
                repro_val=repro_rate,
                bug_type=bug_type,
                api_token=user_token
            )
            
            task_url = result.get("url") if result else None
            
            ticket_record = {
                "summary": summary,
                "priority": final_priority,
                "bug_type": bug_type,
                "created_by": created_by or "PS QA Team",
                "url": task_url,
                "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            }
            save_ticket(ticket_record)
            
            created_tickets.append({
                "summary": summary,
                "priority": final_priority,
                "url": task_url
            })
            
        return {"status": "success", "total_created": len(created_tickets), "tickets": created_tickets}
        
    except Exception as e:
        print(f"Bulk upload error: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)