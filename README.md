# Vibindu

<p align="center">
  <img src="logo.png" alt="Vibindu Logo" width="200"/>
</p>

**Vibindu** is a modern, web-based GRAFCET/SFC editor with AI-powered assistance for designing industrial automation sequences. Built for engineers, students, and automation professionals.

## ✨ Features

- 🎨 **Visual GRAFCET Editor** - Intuitive drag-and-drop interface for creating GRAFCET diagrams
- 🤖 **AI Agents** - Intelligent assistance for diagram generation and optimization
- ⚡ **Real-time Compilation** - Instant validation and SFC code generation
- 📝 **GRAFSCRIPT Language** - Text-based programming for rapid diagram prototyping
- 🔀 **Full SFC Support** - AND/OR divergences, action qualifiers (N, S, R, D, L, P), transitions
- 💾 **Cloud Storage** - User-scoped project persistence with Flydrive
- 🎯 **IEC 61131-3 Compliant** - Industry-standard SFC action types and structures

## 🏗️ Architecture (Agents, Frontend, Backend)

Vibindu is built with a powerful, modular architecture designed for the Gemini 3 Live Hackathon:

- **Frontend (`grafcet-editor/`)**: A React + TypeScript application offering an intuitive drag-and-drop workspace for building GRAFCET and SFC diagrams. It communicates with the backend via REST and WebSockets for real-time AI assistance.
- **Backend (`grafcet-backend/`)**: An AdonisJS application providing robust API endpoints, managing project persistence, compilation, and acting as the middleware bridging the frontend editor with the AI agents.
- **AI Agents (`grafcet-agents/`)**: A Python-based agentic system utilizing Google Gemini. The agents collaborate to analyze user intent, generate operating modes (e.g., Gemma A1, F1), engineer valid SFC logic, and configure the simulation environment—all autonomously. The system uses "Vibe Coding", dynamically verifying and compiling the logic.

## 🚀 Spin-up Instructions for Judges

Follow these steps to reproduce the project and run the Vibindu environment locally.

### Prerequisites

- **Node.js**: Version 18 or higher
- **Python**: Version 3.10 or higher
- **Gemini API Key**: Required for the AI agents to function.

### Step 1: Clone the Repository

```bash
git clone https://github.com/ElHadheqMind/Vibindu-live.git
cd Vibindu-live
```

### Step 2: Configure Environment Variables

Navigate to the `grafcet-agents` directory and configure the Gemini API key:

```bash
cd grafcet-agents
cp .env.example .env
# Edit .env and paste your GEMINI_API_KEY
```

### Step 3: Setup and Install Dependencies

We have provided convenient setup scripts that install all dependencies for the Frontend and Backend simultaneously.

**Windows:**
```cmd
./setup.bat
```

**Linux/Mac:**
```bash
./setup.sh
```

Next, set up the Agent environment:
```bash
cd grafcet-agents
python -m venv venv
# On Windows: venv\Scripts\activate | On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
```

### Step 4: Run the Application!

**1. Start the Frontend and Backend:**
From the root directory (`Vibindu-live`):
**Windows:**
```cmd
./start-dev.bat
```
**Linux/Mac:**
```bash
./start-dev.sh
```
- Frontend will be live at: `http://localhost:5174`
- Backend API will be live at: `http://localhost:3001`

**2. Start the AI Agents Server:**
Open a new terminal, activate the virtual environment, and run the FastAPI server:
```bash
cd grafcet-agents
# On Windows: venv\Scripts\activate | On Mac/Linux: source venv/bin/activate
fastapi run __init__.py --port 8000
```
- Agents API will be live at: `http://localhost:8000`

### Step 5: Test the Application
Open the Frontend URL (`http://localhost:5174`) in your browser. You can now use the visual editor, create new projects, and chat with the AI Agent in the "Vibe" panel to generate SFC code via natural language input!

## 📚 Documentation

- [User Interface Overview](documentation/ui-overview.md)
- [Action Qualifiers Guide](documentation/action-qualifiers.md)
- [Transition Editor](documentation/transition-editor.md)
- [GRAFSCRIPT Language](documentation/grafscript/GRAFSCRIPT.md)
- [Compiler Validation Rules](documentation/compiler-rules.md)

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React, TypeScript, Vite, Zustand |
| Backend | AdonisJS, Prisma, SQLite |
| AI Agents | Python, LangChain |
| Storage | Flydrive (Local/S3) |

## 📄 License

This project is proprietary software. All rights reserved.

## 🤝 Contributing

Contact the maintainers for contribution guidelines.

---

<p align="center">
  Made with ❤️ by the Vibindu Team
</p>

