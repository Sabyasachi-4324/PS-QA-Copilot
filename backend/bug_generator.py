import json
import re
import os
from dotenv import load_dotenv  # 👈 1. Add this import
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from knowledge_base import retrieve_context

load_dotenv()

llm = ChatGoogleGenerativeAI(
    model=os.getenv("GOOGLE_MODEL", "gemini-3.6-flash"),
)

BUG_REPORT_PROMPT = """
You are an expert QA Engineer AI Copilot. 
Take the tester's raw bug description and relevant game rules to generate a structured bug report.

Relevant Game Rules (Context):
{context}

Tester's Raw Bug Description:
{description}

Generate a JSON object with exactly these keys:
- "summary": A concise one-sentence title summarizing the bug.
- "preconditions": Prerequisites before starting the test.
- "repro_steps": An array of strings representing numbered steps.
- "expected_result": What should happen based on game rules?
- "actual_result": What is actually happening?
- "priority": Exactly one of: "P0", "P1", "P2", "P3", "P4", "P5".
- "repro_rate": Exactly one of: "100%", "75%", "50%", "25%", "10%", "Once".

Respond ONLY with valid JSON. Do not include markdown formatting like ```json.
"""

prompt = ChatPromptTemplate.from_template(BUG_REPORT_PROMPT)
chain = prompt | llm

def generate_structured_bug(description: str) -> dict:
    context = retrieve_context(description)
    response = chain.invoke({"context": context, "description": description})

    # ✅ FIX: Gemini 3.x returns response.content as a list of block objects.
    # We need to extract the text from the first text block.
    raw = response.content
    if isinstance(raw, list):
        # Find the first block that has a "text" field
        content = ""
        for block in raw:
            if isinstance(block, dict) and block.get("type") == "text":
                content = block.get("text", "")
                break
            elif hasattr(block, "text"):
                content = block.text
                break
        # Fallback: join all string items if nothing matched
        if not content:
            content = " ".join(str(b) for b in raw)
    else:
        content = str(raw)

    content = content.strip()

    # Strip markdown code fences if model added them anyway
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z]*\n?", "", content)
        content = re.sub(r"\n?```$", "", content).strip()

    try:
        bug_data = json.loads(content)
        return {str(k).lower(): v for k, v in bug_data.items()}
    except Exception as e:
        print(f"⚠️ JSON Parsing Error: {e}")
        print(f"Raw content was: {content}")
        return {}