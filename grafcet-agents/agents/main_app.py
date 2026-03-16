import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import the apps
from orchestrator import app as main_app
from computer_agent_server import app as computer_app
from story_projectteller_server import app as storyteller_app

# The main_app (orchestrator) already has CORS, but we ensure it's broad for Cloud Run
main_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount sub-apps
# Paths will be:
# /ws/vibe (from orchestrator)
# /ws/live-agent (from orchestrator)
# /computer/ws/computer-use
# /storyteller/storytell
main_app.mount("/computer", computer_app)
main_app.mount("/storyteller", storyteller_app)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"🚀 Starting aggregated agent service on port {port}")
    print(f"📍 Main/Vibe/Live: /")
    print(f"📍 Computer Use:   /computer")
    print(f"📍 Storyteller:    /storyteller")
    uvicorn.run(main_app, host="0.0.0.0", port=port)
