
import React, { useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { useSearchParams } from 'react-router-dom';
import { FiPlay, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { useSimulationStore } from '../../store/useSimulationStore';
import { AGENTS_BASE_URL } from '../../config';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
  height: 100%;
  padding: 10px;
  color: #e0e0e0;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
`;

const Label = styled.label`
  font-size: 0.85rem;
  color: #a0a0a0;
  font-weight: 600;
`;

const JsonInput = styled.textarea`
  width: 100%;
  flex: 1;
  background-color: #2a2a2a;
  color: #fab387; /* Peach/Orange for JSON */
  border: 1px solid #3e3e3e;
  border-radius: 6px;
  padding: 10px;
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
  resize: none;
  outline: none;
  min-height: 150px;

  &:focus {
    border-color: #007bff;
  }
`;

const OutputArea = styled.pre`
  width: 100%;
  flex: 1;
  background-color: #1e1e1e;
  color: #a6e3a1; /* Green for output */
  border: 1px solid #3e3e3e;
  border-radius: 6px;
  padding: 10px;
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
  overflow: auto;
  white-space: pre-wrap;
  min-height: 100px;
`;

const Button = styled.button`
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 500;
  transition: background-color 0.2s;

  &:hover {
    background-color: #0069d9;
  }

  &:disabled {
    background-color: #3e3e3e;
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

const StatusMessage = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  padding: 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
  
  background-color: ${props =>
    props.$type === 'success' ? 'rgba(40, 167, 69, 0.2)' :
      props.$type === 'error' ? 'rgba(255, 68, 68, 0.2)' :
        'rgba(0, 123, 255, 0.2)'};
    
  color: ${props =>
    props.$type === 'success' ? '#28a745' :
      props.$type === 'error' ? '#ff4444' :
        '#007bff'};
`;

const Select = styled.select`
  background-color: #2a2a2a;
  color: #e0e0e0;
  border: 1px solid #3e3e3e;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  width: 100%;

  &:focus {
    border-color: #007bff;
    background-color: #363636;
  }
`;

interface ToolTesterProps {
  onExecute: (payload: any) => Promise<any>;
}

const DEFAULT_JSON = `{
  "tool": "ProjectIOTool",
  "actions": [
    {
      "name": "Test_Action_1",
      "qualifier": "N",
      "condition": "",
      "description": "Action created via Tool Tester"
    }
  ],
  "transition_variables": [
    {
      "name": "Test_Sensor_1",
      "type": "Boolean",
      "description": "Sensor test description",
      "address": "%I0.0"
    }
  ]
}`;

const ToolTester: React.FC<ToolTesterProps> = ({ onExecute }) => {
  const [input, setInput] = useState(DEFAULT_JSON);
  const [output, setOutput] = useState<string>("");
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedTool, setSelectedTool] = useState("ProjectIOTool");

  // Tool templates: projectPath is NOT included here — it's automatically
  // injected by handleExecuteTool at execution time (same as when the AI model generates payloads)
  const TOOL_CONFIGS: Record<string, { tool: string, template: any }> = useMemo(() => ({
    "ProjectIOTool": {
      tool: "ProjectIOTool",
      template: {
        "actions": [
          { "name": "Test_Action_1", "qualifier": "N", "condition": "", "description": "Action created via Tool Tester" }
        ],
        "transition_variables": [
          { "name": "Test_Sensor_1", "type": "Boolean", "description": "Sensor test description", "address": "%I0.0" }
        ]
      }
    },
    "create_project": {
      tool: "create_project",
      template: { "name": "New_Project_1", "type": "grafcet" }
    },
    "create_file": {
      tool: "create_file",
      template: { "fileName": "new_file.txt", "fileType": "custom" }
    },
    "update_gsrsm": {
      tool: "update_gsrsm",
      template: {
        "gsrsm_data": {
          "modes": [
            { "id": "A1", "name": "Stop in initial state", "description": "System is stopped" }
          ],
          "transitions": []
        }
      }
    },
    "activate_mode": {
      tool: "activate_mode",
      template: { "mode_id": "A1" }
    },
    "RunSimulation (Quick)": {
      tool: "RunSimulation",
      template: { "mode_id": "A1", "file_name": "default.sfc" }
    },
    "RunSimulation (Long)": {
      tool: "RunSimulation",
      template: {
        "mode_id": "A1",
        "file_name": "default.sfc",
        "steps": 100,
        "delay_ms": 1000
      }
    },
    "create_sfc": {
      tool: "create_sfc",
      template: {
        "sfc_code": "SFC \"Test\" ...",
        "path": "A1",
        "sfc_name": "TestSFC"
      }
    },
    "Simulation (Unified)": {
      tool: "RunSimulation",
      template: {
        "mode_id": "A1",
        "file_name": "default.sfc",
        "auto_stop": true,
        "scenarios": [
          { "name": "Step 1: Fire T0", "variables": { "T0": true } },
          { "name": "Step 2: Fire T1", "variables": { "T1": true, "T0": false } },
          { "name": "Step 3: Fire T2", "variables": { "T2": true, "T1": false } }
        ]
      }
    },
    "Scenario: T0 Only": {
      tool: "RunSimulation",
      template: {
        "mode_id": "A1",
        "file_name": "default.sfc",
        "delay_ms": 2000,
        "scenarios": [
          { "name": "Fire T0", "variables": { "T0": true, "T": true } }
        ]
      }
    },
    "Scenario: T1 Only": {
      tool: "RunSimulation",
      template: {
        "mode_id": "A1",
        "file_name": "default.sfc",
        "delay_ms": 2000,
        "scenarios": [
          { "name": "Fire T1", "variables": { "T1": true } }
        ]
      }
    },
    "Scenario: T2 Only": {
      tool: "RunSimulation",
      template: {
        "mode_id": "A1",
        "file_name": "default.sfc",
        "delay_ms": 2000,
        "scenarios": [
          { "name": "Fire T2", "variables": { "T2": true } }
        ]
      }
    },
    "StopSimulation": {
      tool: "StopSimulation",
      template: {}
    },
    "CompileAndSaveSFC": {
      tool: "CompileAndSaveSFC",
      template: {
        "sfc_code": "SFC \"Test\"\nStep 0 (initial)\nTransition T0 := start\nStep 1\nTransition T1 := done\nEnd",
        "mode_id": "A1",
        "sfc_name": "default"
      }
    }
  }), []);

  const handleToolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const configKey = e.target.value;
    setSelectedTool(configKey);
    const config = TOOL_CONFIGS[configKey];
    if (config) {
      setInput(JSON.stringify(config.template, null, 2));
    }
  };


  const [, setSearchParams] = useSearchParams();

  // ... (inside component)
  const handleExecute = async () => {
    setLoading(true);
    setStatus(null);
    setOutput("");

    try {
      const payload = JSON.parse(input);

      // Automatically add 'tool' key from selection if missing
      const selectedConfig = TOOL_CONFIGS[selectedTool];
      if (!payload.tool && selectedConfig) {
        payload.tool = selectedConfig.tool;
      }

      const result = await onExecute(payload);
      setOutput(JSON.stringify(result, null, 2));

      if (result.success === false) {
        setStatus({ type: 'error', msg: result.message || "Execution Failed" });
      } else {
        setStatus({ type: 'success', msg: "Tool Executed Successfully" });

        // --- NEW: Sync with UI Store for Simulation Tools ---
        if (payload.tool === "RunSimulationStep" || payload.tool === "RunSimulationInit") {
          const simStore = useSimulationStore.getState();

          // 1. Ensure Panel is Open
          if (!simStore.showSimulationPanel) {
            simStore.toggleSimulationPanel();
          }

          // 2. Extract State
          const simState = result.result?.state || result.state;

          if (simState && simState.activeSteps) {
            const stepIds = simState.activeSteps;

            // 3. Activate Simulation Mode if not active
            if (!simStore.isSimulating) {
              simStore.startSimulation(stepIds);
            } else {
              simStore.setActiveSteps(stepIds);
            }

            console.log("[ToolTester] Synced simulation state to UI:", stepIds);
          }
        }

        // Handle RunSimulationSequence - send via WebSocket for streaming
        if (payload.tool === "RunSimulationSequence") {
          // Use dynamic URL from config with protocol switching for production (WSS)
          const wsUrl = AGENTS_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/vibe';
          const ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            console.log("[ToolTester] Sending RunSimulationSequence via WebSocket...");
            ws.send(JSON.stringify({
              type: "test_tool",
              tool: "RunSimulationSequence",
              payload: payload
            }));
          };

          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("[ToolTester] WS message:", data);

            if (data.type === "sim_complete" || data.type === "tool_result") {
              setStatus({ type: 'success', msg: "Simulation Sequence Complete!" });
              ws.close();
            } else if (data.type === "sim_step") {
              setStatus({ type: 'success', msg: `Step: ${data.name}` });
            }
          };

          ws.onerror = () => {
            setStatus({ type: 'error', msg: "WebSocket Error" });
          };

          // Don't proceed with normal flow
          return;
        }
        // Handle URL redirection if provided (Simulation Deep Link)
        const finalUrl = result.url || result.result?.url;
        if (result.success !== false && finalUrl) {
          setStatus({ type: 'info', msg: "Redirecting to simulation file..." });

          try {
            // Extract the path after ?file= for faster local loading if possible
            const urlParams = new URL(finalUrl).searchParams;
            const filePath = urlParams.get('file');

            if (filePath) {
              console.log("[ToolTester] Deep link detected, loading file:", filePath);

              // Preserve ALL params (including autoRun, scenarios)
              const allParams: Record<string, string> = {};
              urlParams.forEach((value, key) => {
                allParams[key] = value;
              });

              // Smooth update via search params
              setSearchParams(allParams, { replace: true });
            }
          } catch (e) {
            console.error("Failed to parse simulation URL:", finalUrl);
          }
        }
        // ---------------------------------------------------
      }
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setStatus({ type: 'error', msg: "Invalid JSON Syntax" });
      } else {
        setStatus({ type: 'error', msg: err.message || "Execution Error" });
      }
      setOutput(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Section>
        <Label>Select Tool</Label>
        <Select value={selectedTool} onChange={handleToolChange}>
          {Object.keys(TOOL_CONFIGS).map(key => (
            <option key={key} value={key}>{key}</option>
          ))}
        </Select>
      </Section>

      <Section>
        <Label>Tool Payload (JSON)</Label>
        <JsonInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
      </Section>

      <Button onClick={handleExecute} disabled={loading}>
        {loading ? "Executing..." : (
          <>
            <FiPlay /> Execute Tool
          </>
        )}
      </Button>

      {status && (
        <StatusMessage $type={status.type}>
          {status.type === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
          {status.msg}
        </StatusMessage>
      )}

      <Section>
        <Label>Output / Result</Label>
        <OutputArea>{output}</OutputArea>
      </Section>
    </Container>
  );
};

export default ToolTester;
