import requests
import os

CLICKUP_API_TOKEN = "pk_234003367_8A6Q7Q4QUWNGJGWNWIDQKL96RLFO0R9J" # Keep your real token

# 🎯 MAP YOUR LIST IDs HERE
LIST_IDS = {
    "prod": "901616434578",       # Your current Prod Bugs list
    "feature": "901616434600"   # Paste your Feature Bugs List ID here!
}

HEADERS = {
    "Authorization": CLICKUP_API_TOKEN,
    "Content-Type": "application/json"
}

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
    
    # Dynamically grab the correct List ID based on frontend selection
    target_list_id = LIST_IDS.get(bug_type, LIST_IDS["prod"])
    url = f"https://api.clickup.com/api/v2/list/{target_list_id}/task"
    
    headers = {
        "Authorization": token_to_use,
        "Content-Type": "application/json"
    }
    
    PRIORITY_FIELD_ID = "7d9cb5e0-3548-45b4-9209-df67e4bfc8fe"
    REPRO_RATE_FIELD_ID = "41784910-a5b0-4f89-b962-94eb02f36423"

    priority_options_map = {
        "P0": "ba9e5d9d-851c-4fd7-b177-13f8ee04a404", 
        "P1": "fb4f7879-4c4c-4b05-9ab1-1f4114163164", 
        "P2": "a48d3123-f690-48e1-a31a-e33a8b8dd872", 
        "P3": "556ac02e-59dd-458e-b4a8-232011434b7d", 
        "P4": "062afc35-1778-4563-be6e-75e3a5cdf955", 
        "P5": "185acd48-acf4-4b69-8630-b9c850ae31bd"
    }
    
    repro_options_map = {
        "100%": "3a5d40a2-4ca2-49a3-9d47-ae3b230ce914", 
        "75%": "1ad119c0-445e-4471-ab41-02bb08ddeee6", 
        "50%": "c5bf9a23-a073-4958-813c-1a9ba5ee0201", 
        "25%": "18961856-2a9f-456b-b58f-d804d10d520b", 
        "10%": "334042ea-bf5c-470b-90d6-5b3fe8cbec0d", 
        "Once": "d1b513ea-592a-42b8-a87f-29524cf7c755"
    }

    custom_fields = []
    
    if priority_val in priority_options_map:
        custom_fields.append({"id": PRIORITY_FIELD_ID, "value": priority_options_map[priority_val]})
        
    if repro_val in repro_options_map:
        custom_fields.append({"id": REPRO_RATE_FIELD_ID, "value": repro_options_map[repro_val]})

    payload = {
        "name": summary,
        "markdown_description": description,
        "custom_fields": custom_fields
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