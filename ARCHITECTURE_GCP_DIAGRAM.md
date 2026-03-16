# 🏗️ Vibindu - Architecture Diagram (GCP & Agents)

This diagram illustrates the complete system architecture of **Vibindu**, showcasing how the React Frontend, Node.js Backend, and Python AI Agents interact, along with their deployment environment on **Google Cloud Platform (Cloud Run)**.

The system firmly integrates with the **Google Gemini API** to power our autonomous "Vibe Coding" engineering agents.

```mermaid
graph TD
    %% Users
    User((User Engineer)) -->|HTTPS / WSS| Frontend

    %% Google Cloud Platform Boundary
    subgraph GCP[Google Cloud Platform Deployment]
        %% Frontend Service
        subgraph FE[Cloud Run: Frontend]
            Frontend[React + TypeScript SPA<br/>Vite & Zustand]
        end

        %% Backend Service
        subgraph BE[Cloud Run: Backend]
            Backend[Node.js + AdonisJS API<br/>REST & WebSockets]
            DB[(SQLite Database<br/>Flydrive Storage)]
            Backend <--> DB
        end

        %% Agent Service
        subgraph AI[Cloud Run: AI Agents Server]
            VibeAgents[Python FastAPI<br/>LangChain, Orchestrator]
            
            subgraph AgentTeam[Specialized Agents]
                Analyst[Analyst Agent<br/>Analyzes requirements]
                Architect[Gemma Architect<br/>Defines logic modes]
                Engineer[SFC Engineer<br/>Writes & Fixes SFC]
                Simulator[Simulator Agent<br/>Configures tests]
            end
            
            VibeAgents --- AgentTeam
        end

        %% Connections within GCP
        Frontend <-->|REST & WebSocket| Backend
        Backend <-->|REST API| VibeAgents

        %% Secret Manager
        SecretManager[Google Secret Manager] -.-> |Injects JWT Secrets| Backend
        SecretManager -.-> |Injects Gemini Key| VibeAgents
    end

    %% External APIs
    subgraph External[External Services]
        Gemini[Google Gemini API]
    end

    %% Connection to External
    VibeAgents <-->|Generative AI Calls| Gemini
```

### Flow Summary:
1. **User Interaction**: The user describes an automation problem in the visual editor (Frontend).
2. **Relay**: The Frontend sends the prompt to the Backend via WebSocket/REST.
3. **Agent Orchestration**: The Backend forwards the payload to the Python Agents server.
4. **Vibe Coding Loop**: 
   - The *Analyst* identifies I/O variables.
   - The *Architect* defines operating modes.
   - The *SFC Engineer* writes logic via Gemini and sends it back to the Backend's syntax compiler. If it fails, it self-corrects based on the error.
   - The *Simulator* sets up the runtime.
5. **Result**: The validated GRAFCET diagram is pushed back to the User in real-time.
