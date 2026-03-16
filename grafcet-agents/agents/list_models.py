import os
from pathlib import Path
from dotenv import load_dotenv
from google import genai

# Load environment variables
env_file = Path(__file__).parent / ".env"
load_dotenv(env_file)

print("Environment Variables:")
for k, v in os.environ.items():
    if "GEMINI" in k or "GOOGLE" in k or "VERTEX" in k:
        val = f"{v[:5]}...{v[-5:]}" if len(v) > 10 else v
        print(f"  {k}: {val}")

API_KEY = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=API_KEY, http_options={'api_version': 'v1beta'})

try:
    for model in client.models.list():
        print(f"- {model.name}")
except Exception as e:
    print(f"Error listing models: {e}")
