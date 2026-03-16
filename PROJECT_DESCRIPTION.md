# 📃 Vibindu - Project Description & Learnings

## System Overview
**Vibindu** is a modern, web-based GRAFCET/Sequential Function Chart (SFC) editor enhanced with a robust, AI-powered multi-agent system designed for industrial automation engineering. Built to streamline the creation of automation sequences, Vibindu offers an intuitive drag-and-drop workspace, instant compilation, and an autonomous "Vibe Coding" AI team that generates, validates, and fixes automation logic purely from natural language descriptions.

## ✨ Features & Functionality
- **Visual GRAFCET Editor**: A highly interactive, drag-and-drop workspace for designing complex GRAFCET and SFC diagrams.
- **AI "Vibe Coding" Agents**: An autonomous multi-agent engineering team:
  - **Analyst**: Extracts technical requirements and I/O variables.
  - **Gemma Architect**: Defines high-level system operating modes.
  - **SFC Engineer**: Generates actual Sequential Function Chart code, passing it through a real-time compiler, and auto-correcting any syntactical or logical failures without user intervention.
  - **Simulator**: Pre-configures test environments so users can hit "Play" immediately.
- **Real-time Compilation**: Instant validation and SFC code generation to ensure IEC 61131-3 compliance.
- **GRAFSCRIPT Language**: A proprietary text-based DSL for rapid diagram prototyping.
- **Full SFC Support**: Robust support for AND/OR divergences, transitions, and action qualifiers (N, S, R, D, L, P).
- **Secure Cloud Storage**: User-scoped project persistence via Flydrive.
- **Instant Cloud Deployment**: Highly available, containerized, and secure microservices automatically deployed on Google Cloud Run.

## 🛠️ Technologies Used
- **Frontend**: React, TypeScript, Vite, Zustand (for state management).
- **Backend (API & Compiler)**: Node.js, AdonisJS, Prisma, SQLite, Flydrive.
- **AI Agent System**: Python, FastAPI, LangChain.
- **Infrastructure & Deployment**: Docker, Google Cloud Run, Cloud Build, Google Secret Manager (for securing API keys and JWTs).

## 📊 Data Sources & External Integrations
- **Google Gemini API**: The core intellectual engine driving our Python agents. We heavily utilize Gemini's context window and reasoning capabilities to understand nuanced industrial descriptions, write domain-specific DSL code, and iteratively fix compilation errors. 

## 💡 Findings and Learnings
Working on Vibindu exposed our team to several advanced concepts in both AI orchestration and scalable cloud deployments:
1. **Multi-Agent Orchestration Yields Better Results**: We initially tried using a single monolithic prompt to generate full SFC diagrams. It was prone to hallucinations. By splitting the problem into specialized roles (Analyst, Architect, Engineer, Simulator) supervised by an orchestrator, the accuracy and reliability of the generated logic skyrocketed.
2. **LLM Self-Correction is Powerful**: We implemented a "Vibe Coding" loop where the SFC Engineer agent is forced to run its generated code against a local compiler. If the compiler throws an error, the agent receives the exact error trace and prompt instructions to fix it. This autonomous feedback loop ensured that the user *always* receives mathematically valid, 100% compliant SFC code.
3. **Serverless Microservices fit AI perfectly**: We learned to separate the slow, compute-heavy AI orchestration (Python FastAPI) from our lightweight, fast user-facing API (Node.js/AdonisJS). Deploying them independently on **Google Cloud Run** allowed us to scale resources efficiently and isolate the Gemini API key securely in Google Secret Manager, giving us a production-ready system right out of the box.
