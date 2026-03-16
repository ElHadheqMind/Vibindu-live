import os
import asyncio
import json
import base64
import sys
import logging
from google import genai
from google.genai import types
from computer_use_tools import ComputerUseTools

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("computer_agent")

MODEL = os.environ.get("COMPUTER_USE_MODEL", "gemini-2.5-computer-use-preview-10-2025")
API_KEY = os.environ.get("GEMINI_API_KEY")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

async def run_computer_agent(prompt: str):
    if not API_KEY:
        print("Error: GEMINI_API_KEY environment variable not set.")
        return

    client = genai.Client(api_key=API_KEY)
    tools = ComputerUseTools()
    
    # 1. Computer Use tool with generic environment (or BROWSER if specifically web)
    # Note: Using the built-in computer_use tool if the model supports it natively.
    # Otherwise, we use custom tool definitions. 
    # For Gemini 2.0 Flash Exp / Gemini 3, we'll try the native 'computer_use' tool.
    
    config = types.GenerateContentConfig(
        tools=[
            types.Tool(
                computer_use=types.ComputerUse(
                    environment=types.Environment.ENVIRONMENT_BROWSER # Most stable environment type
                )
            )
        ]
    )

    print(f"\n[Agent] Starting task: {prompt}")
    
    # Initialize history with the goal and a screenshot
    screenshot = await tools.screenshot()
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part(text=prompt),
                types.Part.from_bytes(data=base64.b64decode(screenshot), mime_type='image/png')
            ]
        )
    ]

    # Loop for multi-step tasks
    max_steps = 10
    for i in range(max_steps):
        print(f"\n--- Step {i+1} ---")
        response = client.models.generate_content(
        model=MODEL,
            contents=contents,
            config=config,
        )

        candidate = response.candidates[0]
        contents.append(candidate.content)

        # Check for tool calls
        function_calls = [p.function_call for p in candidate.content.parts if p.function_call]
        
        if not function_calls:
            text_response = " ".join([p.text for p in candidate.content.parts if p.text])
            print(f"[Agent] Finished: {text_response}")
            break

        # Execute actions
        for fc in function_calls:
            print(f"[Action] Executing: {fc.name} with {fc.args}")
            result = "Default result"
            
            # Map Gemini's computer_use functions to our tools
            # Expected function names from ComputerUse tool:
            # click_at, type_text_at, scroll_at, drag_and_drop, etc.
            
            if fc.name == "click_at":
                result = await tools.mouse_control("click", fc.args.get("x", 500), fc.args.get("y", 500))
            elif fc.name == "type_text_at":
                # First move/click
                await tools.mouse_control("click", fc.args.get("x", 500), fc.args.get("y", 500))
                result = await tools.keyboard_control("type", fc.args.get("text", ""))
                if fc.args.get("press_enter"):
                    await tools.keyboard_control("press", "enter")
            elif fc.name == "open_web_browser":
                # For standalone desktop agent, we can just say browser is "ready" 
                # or actually open a URL if provided.
                result = "Browser opened (simulated/already running)"
            elif fc.name == "wait":
                result = await tools.wait(fc.args.get("ms", 1000))
            else:
                print(f"[Warning] Unknown function call: {fc.name}")
                result = f"Error: Function {fc.name} not implemented in local proxy."

            # Update history with tool response and a NEW screenshot
            new_screenshot = await tools.screenshot()
            contents.append(
                types.Content(
                    role="user",
                    parts=[
                        types.Part(
                            function_response=types.FunctionResponse(
                                name=fc.name,
                                id=fc.id,
                                response={"result": result, "screenshot": new_screenshot}
                            )
                        )
                    ]
                )
            )

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: py computer_agent.py \"Your task prompt here\"")
    else:
        user_prompt = " ".join(sys.argv[1:])
        asyncio.run(run_computer_agent(user_prompt))
