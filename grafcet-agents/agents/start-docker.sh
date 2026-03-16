#!/bin/bash
# Start script for VibIndu Agents in Docker
# Lightweight — no headless browser, no virtual display.
# The computer agent works via WebSocket relay to the user's real browser.

echo "🚀 Starting VibIndu Agent System in Docker..."
echo "   Mode: Frontend Relay (no headless browser)"
echo ""

# --- Start Agents ---
# This launches the consolidated app with Orchestrator, Live Agent, 
# Computer Agent, and Storyteller all in one.
python agents/main_app.py
