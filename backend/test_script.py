import requests
import json

# Hardcoded credentials from your environment configuration
API_TOKEN = "pk_234003367_PGR9SHZE9NLN8DHBBN4UF7VKDKRZCM76"
PROD_LIST_ID = "901616434578"

headers = {
    "Authorization": API_TOKEN,
    "Content-Type": "application/json"
}

url = f"https://api.clickup.com/api/v2/list/{PROD_LIST_ID}/field"

print("="*60)
print("FETCHING CUSTOM FIELDS FOR PROD LIST")
print("="*60)

response = requests.get(url, headers=headers)

if response.status_code == 200:
    data = response.json()
    fields = data.get("fields", [])
    
    print(f"\nSuccessfully found {len(fields)} fields in your Prod List:\n" + "-"*60)
    
    for field in fields:
        field_id = field.get("id")
        field_name = field.get("name")
        field_type = field.get("type")
        
        print(f"Field Name : {field_name}")
        print(f"Field ID   : {field_id}")
        print(f"Type       : {field_type}")
        
        if field_type == "drop_down":
            print("   Dropdown Options & UUIDs:")
            options = field.get("type_config", {}).get("options", [])
            for opt in options:
                opt_name = opt.get("name", "Unnamed")
                opt_id = opt.get("id")
                print(f"     - '{opt_name}' : '{opt_id}'")
        
        print("="*60)
else:
    print(f"Failed to fetch fields. Status Code: {response.status_code}")
    print(response.text)