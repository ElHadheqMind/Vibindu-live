"""
Gemini SuperAgent Startup Script
Launches BOTH agents concurrently:
   - Orchestrator (A2A Server) on port 3002
  - Live Voice Agent (A2A Server) on port 3003
  - Computer Agent (A2A Server) on port 3004
  - Storyteller Agent on port 3005
"""
import os
import sys
import asyncio
from pathlib import Path

# Check if .env file exists (in current dir or parent dir)
env_file = Path(".env")
if not env_file.exists():
    env_file = Path("../.env")

# In Docker or CI, .env might not exist but the key is passed via environment
api_key = os.getenv("GEMINI_API_KEY")

if not env_file.exists() and not api_key:
    print("❌ ERROR: .env file not found and GEMINI_API_KEY not in environment!")
    print("")
    print("📋 Setup Instructions:")
    print("1. Copy .env.example to .env:")
    print("   cp .env.example .env")
    print("")
    print("2. Get your Gemini API key from:")
    print("   https://makersuite.google.com/app/apikey")
    print("")
    print("3. Edit .env and add your API key:")
    print("   GEMINI_API_KEY=your_actual_key_here")
    print("")
    sys.exit(1)

# Load environment variables from the found .env file (if it exists)
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file, override=True)

# Check again if API key is set after potentially loading .env
api_key = os.getenv("GEMINI_API_KEY")
if not api_key or api_key == "your_gemini_api_key_here":
    print("❌ ERROR: GEMINI_API_KEY not configured!")
    print("")
    print("📋 Please edit .env file and set your Gemini API key")
    print("Get your key from: https://makersuite.google.com/app/apikey")
    print("")
    sys.exit(1)

print(f"✅ Environment validated successfully!")
print(f"🚀 Starting VibIndu Agent System (A2A Protocol)...")

# Hybrid Mode Logic: If running natively on Windows but backend is in Docker
HYBRID_MODE = os.getenv("HYBRID_MODE", "false").lower() == "true"
if HYBRID_MODE:
    print(f"🔗 HYBRID MODE ENABLED: Agents will connect to Docker Backend.")
    os.environ["BACKEND_URL"] = os.getenv("BACKEND_URL", "http://backend:3001" if os.getenv("IS_DOCKER", "false").lower() == "true" else "http://localhost:3001")
    os.environ["ORCHESTRATOR_BROADCAST_URL"] = os.getenv("ORCHESTRATOR_BROADCAST_URL", "http://localhost:3002/api/broadcast")
    # For computer use to see the host screen, we don't need any special host overrides
    # but the Orchestrator might need to know common paths.

print(f"📡 Orchestrator Model: {os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite-preview')}")
print(f"🎙️  Live Agent Model: {os.getenv('LIVE_AGENT_MODEL', 'models/gemini-2.5-flash-native-audio-preview-12-2025')}")
print(f"🖥️  Computer Agent Model: {os.getenv('COMPUTER_USE_MODEL', 'gemini-2.5-computer-use-preview-10-2025')}")
print(f"📖 Storyteller Model: gemini-3.1-flash-lite-preview + Imagen 4.0")
print("")


import multiprocessing

def run_orchestrator():
    """Run the Orchestrator (A2A Swarm) on port 3002"""
    import uvicorn
    import os
    print(f"  [PID {os.getpid()}] 🏗️  Starting Orchestrator...")
    uvicorn.run(
        "orchestrator:app",
        host="0.0.0.0",
        port=3002,
        reload=False,
        log_level="info",
        ws_ping_interval=120,
        ws_ping_timeout=120,
    )

def run_live_agent():
    """Run the Live Voice Agent on port 3003"""
    import uvicorn
    import os
    print(f"  [PID {os.getpid()}] 🎙️  Starting Live Agent...")
    uvicorn.run(
        "live_agent_server:app",
        host="0.0.0.0",
        port=3003,
        reload=False,
        log_level="info",
        ws_ping_interval=120,
        ws_ping_timeout=120,
    )

def run_computer_agent():
    """Run the Computer Use Agent on port 3004"""
    import uvicorn
    import os
    print(f"  [PID {os.getpid()}] 🖥️  Starting Computer Use Agent...")
    uvicorn.run(
        "computer_agent_server:app",
        host="0.0.0.0",
        port=3004,
        reload=False,
        log_level="info",
        ws_ping_interval=120,
        ws_ping_timeout=120,
    )

def run_storyteller_agent():
    """Run the Storyteller Agent on port 3005"""
    import uvicorn
    import os
    print(f"  [PID {os.getpid()}] 📖 Starting Storyteller Agent...")
    uvicorn.run(
        "story_projectteller_server:app",
        host="0.0.0.0",
        port=3005,
        reload=False,
        log_level="info",
    )

if __name__ == "__main__":
    # Multiprocessing setup for Windows
    multiprocessing.freeze_support()

    print("=" * 60)
    print("  🏗️  Orchestrator  → http://localhost:3002")
    print("  🎙️  Live Agent    → http://localhost:3003")
    print("  🖥️  Computer Use  → http://localhost:3004")
    print("  📖 Storyteller   → http://localhost:3005")
    print("=" * 60)
    print("\n🚀 Starting all agents in separate processes (Parallel Mode)...\n")

    p1 = multiprocessing.Process(target=run_orchestrator)
    p2 = multiprocessing.Process(target=run_live_agent)
    p3 = multiprocessing.Process(target=run_computer_agent)
    p4 = multiprocessing.Process(target=run_storyteller_agent)

    p1.start()
    p2.start()
    p3.start()
    p4.start()

    try:
        # Wait for all processes (or CTRL+C)
        p1.join()
        p2.join()
        p3.join()
        p4.join()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down agents...")
        p1.terminate()
        p2.terminate()
        p3.terminate()
        p4.terminate()
        print("✅ Shutdown complete.")
