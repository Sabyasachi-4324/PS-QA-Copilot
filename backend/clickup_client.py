import requests
import os
import datetime
import json
from dotenv import load_dotenv

load_dotenv()

CLICKUP_API_TOKEN = os.getenv("CLICKUP_API_TOKEN")

LIST_IDS = {
    "prod": os.getenv("CLICKUP_PROD_LIST_ID"),       
    "feature": os.getenv("CLICKUP_FEATURE_LIST_ID")
}

HEADERS = {
    "Authorization": CLICKUP_API_TOKEN,
    "Content-Type": "application/json"
}

# --- GLOBAL CONFIG & MAPS FROM .ENV ---
PRIORITY_FIELD_ID = os.getenv("CLICKUP_PRIORITY_FIELD_ID")
REPRO_RATE_FIELD_ID = os.getenv("CLICKUP_REPRO_FIELD_ID")

priority_options_map = json.loads(os.getenv("CLICKUP_PRIORITY_MAP"))
repro_options_map = json.loads(os.getenv("CLICKUP_REPRO_MAP"))

def get_clickup_user_name(api_token: str):
    """Verifies token with ClickUp and fetches the user's username."""
    url = "https://api.clickup.com/api/v2/user"
    headers = {"Authorization": api_token}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        user_data = data.get("user", {})
        return {
            "success": True,
            "username": user_data.get("username", "Unknown QA")
        }
    else:
        return {"success": False, "message": "Invalid API Token"}

def create_task(summary: str, description: str, priority_val: str, repro_val: str, bug_type: str, api_token: str = None):
    token_to_use = api_token if api_token else CLICKUP_API_TOKEN
    print(f"Creating ClickUp ticket: {summary} in {bug_type} list")
    
    target_list_id = LIST_IDS.get(bug_type, LIST_IDS["prod"])
    url = f"https://api.clickup.com/api/v2/list/{target_list_id}/task"
    
    headers = {
        "Authorization": token_to_use,
        "Content-Type": "application/json"
    }

    custom_fields = []
    
    if priority_val in priority_options_map:
        custom_fields.append({"id": PRIORITY_FIELD_ID, "value": priority_options_map[priority_val]})
        
    if repro_val in repro_options_map:
        custom_fields.append({"id": REPRO_RATE_FIELD_ID, "value": repro_options_map[repro_val]})

    payload = {
        "name": summary,
        "markdown_description": description,
        "custom_fields": custom_fields,
        "tags": ["ai-copilot"]
    }

    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code == 200:
        task_data = response.json()
        return {
            "id": task_data.get("id"),
            "url": task_data.get("url")
        }
    else:
        print(f"Failed to create task: {response.text}")
        return None

def upload_attachment(task_id: str, file_path: str, api_token: str = None):
    token_to_use = api_token if api_token else CLICKUP_API_TOKEN
    headers = {"Authorization": token_to_use}
    url = f"https://api.clickup.com/api/v2/task/{task_id}/attachment"
    
    with open(file_path, "rb") as f:
        files = {"attachment": (os.path.basename(file_path), f)}
        response = requests.post(url, headers=headers, files=files)
        
    return response.status_code == 200

def get_ai_tickets_from_clickup(api_token: str = None):
    """Fetches all tasks live from ClickUp lists that have the 'ai-copilot' tag for synchronized dashboard metrics."""
    token_to_use = api_token if api_token else CLICKUP_API_TOKEN
    headers = {"Authorization": token_to_use}
    ai_tickets = []

    # Dynamically generates the reverse map (ID -> Label) from your environment variable
    id_to_priority = {v: k for k, v in priority_options_map.items()}

    for bug_type, list_id in LIST_IDS.items():
        url = f"https://api.clickup.com/api/v2/list/{list_id}/task?include_closed=true"
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            tasks = response.json().get("tasks", [])
            for task in tasks:
                tags = [t.get("name", "").lower() for t in task.get("tags", [])]
                if "ai-copilot" in tags:
                    created_ms = task.get("date_created")
                    timestamp = "N/A"
                    if created_ms:
                        try:
                            timestamp = datetime.datetime.fromtimestamp(int(created_ms) / 1000).strftime("%Y-%m-%d %H:%M")
                        except Exception:
                            pass
                    
                    priority = "P2"
                    for cf in task.get("custom_fields", []):
                        if cf.get("id") == PRIORITY_FIELD_ID:
                            val = cf.get("value")
                            if val in id_to_priority:
                                priority = id_to_priority[val]
                            break

                    ai_tickets.append({
                        "summary": task.get("name"),
                        "priority": priority,
                        "bug_type": bug_type,
                        "created_by": "AI Copilot",
                        "url": task.get("url"),
                        "timestamp": timestamp
                    })
    
    ai_tickets.sort(key=lambda x: x["timestamp"], reverse=True)
    return ai_tickets