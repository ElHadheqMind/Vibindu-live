import os
import asyncio
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv("c:/Users/pc/Desktop/G7V0101/GAIlive/grafcet-agents/agents/.env", override=True)

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"), http_options={'api_version': 'v1beta'})

async def test_veo():
    print("Generating short video...")
    operation = client.models.generate_videos(
        model="veo-3.1-fast-generate-preview",
        prompt="A red ball rolling on grass, very simple, 1 second",
        config=types.GenerateVideosConfig(number_of_videos=1, aspect_ratio="16:9")
    )
    print("Operation started:", getattr(operation, 'name', 'N/A'))
    while not operation.done:
        await asyncio.sleep(5)
        operation = client.operations.get(operation)
        print("Polling...")

    print("Done!")
    if operation.result and operation.result.generated_videos:
        video_obj = operation.result.generated_videos[0]
        print("Video object type:", type(video_obj))
        print("Video properties:", dir(video_obj))
        if hasattr(video_obj, 'video'):
            print("video.video type:", type(video_obj.video))
            print("video.video properties:", dir(video_obj.video))
            print("video.video dict representation:")
            try:
                print(video_obj.video.model_dump())
            except:
                pass
            print("Does it have uri?", getattr(video_obj.video, 'uri', None))
            print("Does it have video_bytes?", type(getattr(video_obj.video, 'video_bytes', None)))
        else:
            print("No video attribute.")
            

asyncio.run(test_veo())
