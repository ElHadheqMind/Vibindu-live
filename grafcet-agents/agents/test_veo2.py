import time
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv("c:/Users/pc/Desktop/G7V0101/GAIlive/grafcet-agents/agents/.env", override=True)

MODEL = "veo-3.1-fast-generate-preview"

client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key=os.environ.get("GEMINI_API_KEY"),
)

video_config = types.GenerateVideosConfig(
    aspect_ratio="16:9", # supported values: "16:9" or "16:10"
    number_of_videos=1, # supported values: 1 - 4
)

def generate():
    print("Generating short video...", flush=True)
    operation = client.models.generate_videos(
        model=MODEL,
        prompt="A red ball rolling on grass, very simple, 1 second",
        config=video_config,
    )

    # Waiting for the video(s) to be generated
    while not operation.done:
        print("Video has not been generated yet. Check again in 10 seconds...", flush=True)
        time.sleep(10)
        operation = client.operations.get(operation)

    result = operation.result
    if not result:
        print("Error occurred while generating video.", flush=True)
        return

    generated_videos = result.generated_videos
    if not generated_videos:
        print("No videos were generated.", flush=True)
        return

    print(f"Generated {len(generated_videos)} video(s).", flush=True)
    for n, generated_video in enumerate(generated_videos):
        print(f"Video has been generated: {generated_video.video.uri}", flush=True)
        # Official SDK download logic
        client.files.download(file=generated_video.video)
        
        output_path = f"c:/Users/pc/Desktop/G7V0101/GAIlive/grafcet-agents/agents/test_video_{n}.mp4"
        generated_video.video.save(output_path) # Saves the video(s)
        print(f"Video {generated_video.video.uri} has been downloaded to {output_path}.", flush=True)

if __name__ == "__main__":
    generate()
