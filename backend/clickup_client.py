import requests
import os
import datetime
import json
import time
from dotenv import load_dotenv

load_dotenv()

CLICKUP_API_TOKEN = os.getenv("CLICKUP_API_TOKEN")

LIST_IDS = {
    "prod": os.getenv("CLICKUP_PROD_LIST_ID"),        
    "feature": os.getenv("CLICKUP_FEATURE_LIST_ID")
}

# --- IN-MEMORY CACHE (TTL = 10 minutes) ---
_cache = {}
CACHE_TTL = 600  # 600 seconds = 10 minutes

# --- DYNAMIC CONFIG & MAPS PER LIST TYPE ---
CONFIG_MAPS = {
    "prod": {
        "priority_field_id": os.getenv("CLICKUP_PROD_PRIORITY_FIELD_ID") or os.getenv("CLICKUP_PRIORITY_FIELD_ID"),
        "repro_field_id": os.getenv("CLICKUP_PROD_REPRO_FIELD_ID") or os.getenv("CLICKUP_REPRO_FIELD_ID"),
        "priority_map": json.loads(os.getenv("CLICKUP_PROD_PRIORITY_MAP") or os.getenv("CLICKUP_PRIORITY_MAP", "{}")),
        "repro_map": json.loads(os.getenv("CLICKUP_PROD_REPRO_MAP") or os.getenv("CLICKUP_REPRO_MAP", "{}"))
    },
    "feature": {
        "priority_field_id": os.getenv("CLICKUP_FEATURE_PRIORITY_FIELD_ID") or os.getenv("CLICKUP_PRIORITY_FIELD_ID"),
        "repro_field_id": os.getenv("CLICKUP_FEATURE_REPRO_FIELD_ID") or os.getenv("CLICKUP_REPRO_FIELD_ID"),
        "priority_map": json.loads(os.getenv("CLICKUP_FEATURE_PRIORITY_MAP") or os.getenv("CLICKUP_PRIORITY_MAP", "{}")),
        "repro_map": json.loads(os.getenv("CLICKUP_FEATURE_REPRO_MAP") or os.getenv("CLICKUP_REPRO_MAP", "{}"))
    }
}

FEATURE_FIELD_ID = os.getenv("CLICKUP_FEATURE_FIELD_ID")

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

def get_list_assignees(list_id: str = None, api_token: str = None):
    """Harvests unique assignees dynamically from existing tasks across Prod and Feature lists with caching."""
    token_to_use = api_token if api_token else CLICKUP_API_TOKEN
    cache_key = f"assignees_{list_id}_{token_to_use}"
    current_time = time.time()
    
    # Return cached data if valid
    if cache_key in _cache:
        data, timestamp = _cache[cache_key]
        if current_time - timestamp < CACHE_TTL:
            return data

    headers = {"Authorization": token_to_use, "Content-Type": "application/json"}
    
    list_ids_to_check = [
        os.getenv("CLICKUP_PROD_LIST_ID", "205307273"),
        os.getenv("CLICKUP_FEATURE_LIST_ID", "205406110")
    ]
    if list_id and list_id not in list_ids_to_check:
        list_ids_to_check.append(list_id)
        
    unique_assignees = {}

    for l_id in list_ids_to_check:
        url = f"https://api.clickup.com/api/v2/list/{l_id}/task?include_closed=true"
        response = requests.get(url, headers=headers)
        
        # Fallback to master token if user token fails
        if response.status_code != 200 and token_to_use != CLICKUP_API_TOKEN:
            headers["Authorization"] = CLICKUP_API_TOKEN
            response = requests.get(url, headers=headers)
            
        if response.status_code == 200:
            tasks = response.json().get("tasks", [])
            for task in tasks:
                for assignee in task.get("assignees", []):
                    uid = assignee.get("id")
                    uname = assignee.get("username")
                    if uid and uname:
                        unique_assignees[uid] = {
                            "id": uid,
                            "username": uname
                        }
                        
    formatted_assignees = list(unique_assignees.values())
    result = [{"id": "", "username": "-- Unassigned --"}] + formatted_assignees
    
    # Store in cache
    _cache[cache_key] = (result, current_time)
    return result

def get_field_options_map(list_id: str, field_id: str, api_token: str = None):
    """Dynamically fetches dropdown options with master token fallback and caching."""
    token_to_use = api_token if api_token else CLICKUP_API_TOKEN
    cache_key = f"field_options_{list_id}_{field_id}_{token_to_use}"
    current_time = time.time()
    
    # Return cached data if valid
    if cache_key in _cache:
        data, timestamp = _cache[cache_key]
        if current_time - timestamp < CACHE_TTL:
            return data

    headers = {"Authorization": token_to_use}
    url = f"https://api.clickup.com/api/v2/list/{list_id}/field"
    
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200 and token_to_use != CLICKUP_API_TOKEN:
        headers["Authorization"] = CLICKUP_API_TOKEN
        response = requests.get(url, headers=headers)
        
    options_map = {}
    if response.status_code == 200:
        fields = response.json().get("fields", [])
        for field in fields:
            if field.get("id") == field_id:
                options = field.get("type_config", {}).get("options", [])
                for opt in options:
                    opt_name = opt.get("name") or opt.get("id")
                    options_map[opt_name] = opt.get("id")
                    options_map[opt.get("id")] = opt.get("id")
                break
                
    # Store in cache
    _cache[cache_key] = (options_map, current_time)
    return options_map

def get_feature_custom_field_options(list_id: str, api_token: str = None):
    """Discovers the 'Feature' custom field options map using FEATURE_FIELD_ID."""
    if not FEATURE_FIELD_ID:
        return None
    options_map = get_field_options_map(list_id, FEATURE_FIELD_ID, api_token)
    return {
        "field_id": FEATURE_FIELD_ID,
        "options_map": options_map
    }

def create_task(
    summary: str, 
    description: str, 
    priority_val: str, 
    repro_val: str, 
    bug_type: str, 
    assignee_id: str = None, 
    feature_val: str = None, 
    api_token: str = None
):
    token_to_use = api_token if api_token else CLICKUP_API_TOKEN
    print(f"Creating ClickUp ticket: {summary} in {bug_type} list")
    
    target_list_id = LIST_IDS.get(bug_type, LIST_IDS["prod"])
    url = f"https://api.clickup.com/api/v2/list/{target_list_id}/task"
    
    headers = {
        "Authorization": token_to_use,
        "Content-Type": "application/json"
    }

    # Load correct field IDs and maps depending on bug_type (prod vs feature)
    bug_config = CONFIG_MAPS.get(bug_type, CONFIG_MAPS["prod"])
    priority_field_id = bug_config["priority_field_id"]
    repro_field_id = bug_config["repro_field_id"]
    priority_options_map = bug_config["priority_map"]
    repro_options_map = bug_config["repro_map"]

    custom_fields = []
    
    if priority_val in priority_options_map and priority_field_id:
        custom_fields.append({"id": priority_field_id, "value": priority_options_map[priority_val]})
        
    if repro_val in repro_options_map and repro_field_id:
        custom_fields.append({"id": repro_field_id, "value": repro_options_map[repro_val]})

    # Dynamically handle Feature custom field ONLY for feature bugs
    if bug_type == "feature" and feature_val and FEATURE_FIELD_ID:
        feature_map = get_field_options_map(target_list_id, FEATURE_FIELD_ID, token_to_use)
        
        matched_val = feature_map.get(feature_val)
        if not matched_val:
            for k, v in feature_map.items():
                if str(k).lower() == str(feature_val).lower():
                    matched_val = v
                    break
        
        if matched_val:
            custom_fields.append({"id": FEATURE_FIELD_ID, "value": matched_val})

    payload = {
        "name": summary,
        "markdown_description": description,
        "custom_fields": custom_fields,
        "tags": ["ai-copilot"]
    }

    if assignee_id:
        try:
            payload["assignees"] = [int(assignee_id)]
        except ValueError:
            payload["assignees"] = [assignee_id]

    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code != 200 and api_token and api_token != CLICKUP_API_TOKEN:
        print("[WARNING] User token failed. Retrying with master CLICKUP_API_TOKEN...")
        headers["Authorization"] = CLICKUP_API_TOKEN
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

    for bug_type, list_id in LIST_IDS.items():
        bug_config = CONFIG_MAPS.get(bug_type, CONFIG_MAPS["prod"])
        priority_field_id = bug_config["priority_field_id"]
        priority_options_map = bug_config["priority_map"]
        id_to_priority = {v: k for k, v in priority_options_map.items()}

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
                        if cf.get("id") == priority_field_id:
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