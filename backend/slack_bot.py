import os
import json
import datetime
import re
import requests
import threading
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from slack_bolt import App
from slack_bolt.adapter.fastapi import SlackRequestHandler

# Load environment variables from your root .env file
load_dotenv()

# Import core functions from main.py and bug_generator
from bug_generator import generate_structured_bug
from main import create_task, upload_attachment, load_users

# Initialize Slack App using both Bot Token and Signing Secret
app = App(
    token=os.getenv("SLACK_BOT_TOKEN"),
    signing_secret=os.getenv("SLACK_SIGNING_SECRET")
)

# Initialize FastAPI app for Render HTTP hosting
api_app = FastAPI()
handler = SlackRequestHandler(app)

TICKET_DB_FILE = os.getenv("TICKET_DB_FILE", "tickets_db.json")

def save_ticket_to_db(ticket_data):
    """Saves ticket history so it instantly shows up on your web dashboard"""
    tickets = []
    if os.path.exists(TICKET_DB_FILE):
        try:
            with open(TICKET_DB_FILE, "r") as f:
                tickets = json.load(f)
        except Exception:
            tickets = []
    tickets.insert(0, ticket_data)
    with open(TICKET_DB_FILE, "w") as f:
        json.dump(tickets, f, indent=4)

def format_markdown_description(bug_data: dict) -> str:
    """Formats JSON bug data into clean text, stripping duplicate numbers from steps"""
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

# Silence App Home open warnings in terminal logs
@app.event("app_home_opened")
def handle_app_home_opened(client, event):
    pass

# 1. Listen for the /qabug slash command in Slack (With Threading Fix)
@app.command("/qabug")
def handle_qabug_command(ack, body, client):
    ack() # Acknowledge command instantly to Slack to prevent 3-second timeout
    
    trigger_id = body["trigger_id"]
    user_text = body.get("text", "").strip()
    channel_id = body["channel_id"]
    thread_ts = body.get("thread_ts")
    user_id = body["user_id"]

    if not user_text:
        client.chat_postEphemeral(
            channel=channel_id,
            user=user_id,
            text="❌ Please provide a bug description. Example: `/qabug App crashes when clicking inventory`"
        )
        return

    def process_ai_bug():
        # STEP A: Open initial loading modal
        loading_view = {
            "type": "modal",
            "callback_id": "bug_edit_modal",
            "title": {"type": "plain_text", "text": "AI Bug Copilot"},
            "close": {"type": "plain_text", "text": "Cancel"},
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "🤖 *Analyzing bug observation & querying knowledge base...* Please wait."
                    }
                }
            ]
        }

        try:
            response = client.views_open(trigger_id=trigger_id, view=loading_view)
            view_id = response["view"]["id"]
        except Exception as e:
            print(f"Error opening loading modal: {e}")
            return

        # STEP B: Run RAG pipeline safely with Quota/Rate Limit handling
        try:
            bug_data = generate_structured_bug(user_text)
        except Exception as ai_error:
            print(f"AI Generation Error (Likely Rate Limit): {ai_error}")
            error_view = {
                "type": "modal",
                "callback_id": "bug_edit_modal",
                "title": {"type": "plain_text", "text": "API Quota Exceeded"},
                "close": {"type": "plain_text", "text": "Close"},
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": "⚠️ *Gemini API Free Tier Quota Exceeded*\n\nYou have reached the maximum number of free requests for today. Please wait for your quota to reset or upgrade your Google AI Studio plan."
                        }
                    }
                ]
            }
            try:
                client.views_update(view_id=view_id, view=error_view)
            except Exception:
                pass
            return

        summary = bug_data.get("summary") or "Slack Bug Report"
        ai_priority = bug_data.get("priority", "P2").upper()
        formatted_desc = format_markdown_description(bug_data)

        priority_options = [
            {"text": {"type": "plain_text", "text": "P1 - Critical"}, "value": "P1"},
            {"text": {"type": "plain_text", "text": "P2 - High"}, "value": "P2"},
            {"text": {"type": "plain_text", "text": "P3 - Medium"}, "value": "P3"},
            {"text": {"type": "plain_text", "text": "P4 - Low"}, "value": "P4"},
            {"text": {"type": "plain_text", "text": "P5 - Lowest"}, "value": "P5"}
        ]
        initial_priority = ai_priority if any(o["value"] == ai_priority for o in priority_options) else "P2"
        initial_priority_opt = next(o for o in priority_options if o["value"] == initial_priority)

        metadata_payload = json.dumps({
            "channel_id": channel_id,
            "thread_ts": thread_ts
        })

        # STEP C: Update modal with clean UI
        final_modal_view = {
            "type": "modal",
            "callback_id": "bug_edit_modal",
            "private_metadata": metadata_payload,
            "title": {"type": "plain_text", "text": "Review & Edit AI Bug"},
            "submit": {"type": "plain_text", "text": "Approve & Create"},
            "close": {"type": "plain_text", "text": "Cancel"},
            "blocks": [
                {
                    "type": "input",
                    "block_id": "summary_block",
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "summary_action",
                        "initial_value": summary
                    },
                    "label": {"type": "plain_text", "text": "Ticket Summary (Title)"}
                },
                {
                    "type": "input",
                    "block_id": "priority_block",
                    "element": {
                        "type": "static_select",
                        "action_id": "priority_action",
                        "placeholder": {"type": "plain_text", "text": "Select Priority"},
                        "initial_option": initial_priority_opt,
                        "options": priority_options
                    },
                    "label": {"type": "plain_text", "text": "Priority Level"}
                },
                {
                    "type": "input",
                    "block_id": "desc_block",
                    "element": {
                        "type": "plain_text_input",
                        "action_id": "desc_action",
                        "multiline": True,
                        "initial_value": formatted_desc
                    },
                    "label": {"type": "plain_text", "text": "Structured Description"}
                },
                {
                    "type": "input",
                    "block_id": "file_block",
                    "optional": True,
                    "element": {
                        "type": "file_input",
                        "action_id": "file_action",
                        "max_files": 3
                    },
                    "label": {"type": "plain_text", "text": "Attach Evidence (Optional Screenshots/Videos)"}
                }
            ]
        }

        try:
            client.views_update(view_id=view_id, view=final_modal_view)
        except Exception as e:
            print(f"Could not update modal: {e}")

    # Start execution in a background thread so the HTTP connection returns immediately
    threading.Thread(target=process_ai_bug).start()

# 2. Handle modal submission when user clicks "Approve & Create"
@app.view("bug_edit_modal")
def handle_modal_submission(ack, body, client):
    ack() # Close modal successfully
    
    state = body["view"]["state"]["values"]
    summary = state["summary_block"]["summary_action"]["value"]
    priority = state["priority_block"]["priority_action"]["selected_option"]["value"]
    description = state["desc_block"]["desc_action"]["value"]
    
    user_id = body["user"]["id"]
    
    # Fetch real name and prevent email fallback
    user_name = body["user"]["username"]
    try:
        user_info = client.users_info(user=user_id)
        profile = user_info.get("user", {}).get("profile", {})
        real_name = profile.get("real_name") or profile.get("display_name")
        if real_name and "@" not in real_name:
            user_name = real_name
    except Exception:
        pass

    # Match with saved users in users_db.json to fetch ClickUp token
    user_token = None
    saved_users = load_users()
    if saved_users:
        if user_name in saved_users:
            user_token = saved_users[user_name]
        else:
            for u_name, u_token in saved_users.items():
                if u_name.lower() in user_name.lower() or user_name.lower() in u_name.lower():
                    user_token = u_token
                    user_name = u_name
                    break

    metadata = json.loads(body["view"].get("private_metadata", "{}"))
    channel_id = metadata.get("channel_id")
    thread_ts = metadata.get("thread_ts")

    # Push task to ClickUp
    clickup_task = create_task(
        summary=summary,
        description=description,
        priority_val=priority,
        repro_val="100%",
        bug_type="prod",
        api_token=user_token
    )

    if clickup_task:
        task_id = clickup_task.get("id")
        ticket_url = clickup_task.get("url")

        # Securely download Slack file attachments and stream them to ClickUp
        uploaded_files = state["file_block"]["file_action"].get("files", [])
        slack_token = os.getenv("SLACK_BOT_TOKEN")

        for f in uploaded_files:
            file_url = f.get("url_private")
            file_name = f.get("name", "evidence.png")
            if file_url and slack_token:
                try:
                    headers = {"Authorization": f"Bearer {slack_token}"}
                    res = requests.get(file_url, headers=headers, allow_redirects=True)
                    if res.status_code == 200:
                        temp_path = f"./temp_{file_name}"
                        with open(temp_path, "wb") as tmp:
                            tmp.write(res.content)
                        
                        upload_attachment(task_id, temp_path, api_token=user_token)
                        
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                except Exception as ex:
                    print(f"Failed to attach file to ClickUp: {ex}")

        # Save record to local dashboard database
        ticket_record = {
            "summary": summary,
            "priority": priority,
            "bug_type": "prod",
            "created_by": user_name,
            "url": ticket_url,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        }
        save_ticket_to_db(ticket_record)

        # Send acknowledgment message back to channel/thread
        if channel_id:
            try:
                client.chat_postMessage(
                    channel=channel_id,
                    thread_ts=thread_ts,
                    text=f"🎉 *Bug Ticket Successfully Created!*\n• *Priority:* `{priority}` | *Environment:* `prod` | *Repro:* `100%`\n*<{ticket_url}|{summary}>*\n> *Reporter:* `👤 {user_name}`"
                )
            except Exception as e:
                print(f"Failed to send Slack acknowledgement message: {e}")

# --- FASTAPI WEB ENDPOINT FOR RENDER ---
@api_app.post("/slack/events")
async def slack_endpoint(req: Request):
    return await handler.handle(req)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Slack AI Copilot Bot is running on port {port}...")
    uvicorn.run("slack_bot:api_app", host="0.0.0.0", port=port)