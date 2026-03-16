import asyncio
import websockets
import json
import base64

async def test_live_agent():
    uri = "ws://localhost:3003/ws/live-agent"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to Live Agent WS")
            
            # Wait for session ready
            msg = await websocket.recv()
            print(f"Received: {msg}")
            
            # Start session
            await websocket.send(json.dumps({"type": "start_session"}))
            
            # Send a mock audio chunk (1 second of silence-ish)
            audio_data = base64.b64encode(b'\x00' * 32000).decode()
            await websocket.send(json.dumps({"type": "audio_chunk", "data": audio_data}))
            print("Sent mock audio chunk")
            
            # Send a mock image frame (small red dot JPEG)
            # This is a base64 of a 1x1 red dot jpeg
            red_dot_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
            await websocket.send(json.dumps({"type": "image_frame", "data": red_dot_b64}))
            print("Sent mock image frame")
            
            # Receive few messages
            for _ in range(5):
                try:
                    resp = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    print(f"Agent response: {resp[:100]}...")
                except asyncio.TimeoutError:
                    print("Timeout waiting for response")
                    break
                    
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_live_agent())
