"""
Live Agent – Standalone FastAPI Application (A2A Server)
Runs on port 3003 as an independent agent.

Endpoints:
  GET  /.well-known/agent.json   → A2A Agent Card
  WS   /ws/live-agent            → Browser ↔ Gemini Live Audio relay
"""

import os
import sys
import json
import logging

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger("live_agent_server")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="VibIndu Live Voice Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── A2A Agent Card ──────────────────────────────────────────────────────────

LIVE_AGENT_CARD = {
    "name": "VibIndu Live Voice Agent",
    "description": "Real-time voice interaction agent powered by Gemini 2.5 Flash Native Audio. "
                   "Helps users articulate automation engineering requests through natural conversation, "
                   "then dispatches refined queries to the Engineering Team agent via A2A protocol.",
    "url": os.environ.get("LIVE_AGENT_URL", "http://localhost:3003"),
    "version": "1.0.0",
    "capabilities": {
        "streaming": True,
        "pushNotifications": False,
    },
    "skills": [
        {
            "id": "voice_interaction",
            "name": "Voice Interaction",
            "description": "Real-time bidirectional voice conversation with the user using Gemini Native Audio.",
            "tags": ["voice", "audio", "conversation"],
        },
        {
            "id": "query_refinement",
            "name": "Query Refinement",
            "description": "Helps users clarify and refine their automation engineering requests before dispatching.",
            "tags": ["nlp", "intent", "refinement"],
        },
    ],
    "defaultInputModes": ["audio/pcm", "text/plain"],
    "defaultOutputModes": ["audio/pcm", "text/plain"],
    "protocols": ["rest"],
    # A2A peer reference — the Orchestrator this agent dispatches to
    "a2a_peers": [
        {
            "name": "VibIndu Engineering Team",
            "url": os.environ.get("ORCHESTRATOR_URL", "http://localhost:3002"),
            "agent_card": os.environ.get("ORCHESTRATOR_URL", "http://localhost:3002") + "/.well-known/agent.json",
        }
    ],
}


@app.get("/.well-known/agent.json")
async def agent_card():
    """A2A Agent Card — describes this Live Agent's capabilities."""
    return LIVE_AGENT_CARD


@app.get("/")
async def root():
    return {
        "agent": "VibIndu Live Voice Agent",
        "a2a": True,
        "agent_card": "/.well-known/agent.json",
        "websocket": "/ws/live-agent",
    }


# ─── WebSocket from live_agent.py ────────────────────────────────────────────

from fastapi import WebSocket

@app.websocket("/ws/live-agent")
async def ws_live_agent(websocket: WebSocket):
    """Live Agent WebSocket — Gemini Native Audio relay."""
    from live_agent import live_agent_websocket
    await live_agent_websocket(websocket)


# ─── Startup ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "live_agent_server:app", 
        host="0.0.0.0", 
        port=3003, 
        reload=True,
        ws_ping_interval=120,
        ws_ping_timeout=120,
    )
