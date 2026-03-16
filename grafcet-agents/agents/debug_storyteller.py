import os
import asyncio
from story_projectteller_agent import StoryProjectteller
from pathlib import Path
from dotenv import load_dotenv

async def test_storyteller():
    # Load environment variables
    env_file = Path(__file__).parent / ".env"
    load_dotenv(env_file)
    
    print(f"DEBUG: GEMINI_API_KEY is {'SET' if os.environ.get('GEMINI_API_KEY') else 'NOT SET'}")
    
    agent = StoryProjectteller()
    spec = "A simple automation machine for sorting bananas."
    
    print("\n--- Testing tell_story ---")
    
    async def mock_on_asset(asset_type, filename, b64_data):
        print(f"\n[REAL-TIME CALLBACK TRIGGERED] {asset_type} generated: {filename} (Base64 size: {len(b64_data)})")
    
    try:
        result = await agent.tell_story(spec, "StoryExperience", on_asset_generated=mock_on_asset)
        print("\nSUCCESS!")
        print(f"Story length: {len(result['story'])}")
    except Exception as e:
        print("\nFAILED!")
        print(f"Error Type: {type(e)}")
        print(f"Error Message: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_storyteller())
