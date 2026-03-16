import os
from google import genai
from pathlib import Path
from dotenv import load_dotenv

env_file = Path(__file__).parent / ".env"
load_dotenv(env_file)
API_KEY = os.environ.get("GEMINI_API_KEY")

def check_model(model_name, api_version=None):
    print(f"\n--- Checking {model_name} (API Version: {api_version}) ---")
    opts = {}
    if api_version:
        opts['api_version'] = api_version
    
    client = genai.Client(api_key=API_KEY, http_options=opts)
    try:
        model = client.models.get(model=model_name)
        print(f"✅ Found! Name: {model.name}")
        print(f"   Supported methods: {model.supported_methods}")
    except Exception as e:
        print(f"❌ Not found: {e}")

check_model("models/gemini-2.5-flash-preview-tts", "v1beta")
check_model("models/gemini-2.5-flash-preview-tts")
check_model("gemini-2.5-flash-preview-tts")
