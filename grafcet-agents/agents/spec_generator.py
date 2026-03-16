"""
Multimodal spec generator for converting PDF documentation into requirements.
Uses Gemini's native PDF understanding capabilities.
"""

import os
import json
import aiohttp
from typing import Optional
from dataclasses import dataclass

# Load environment variables EARLY (before importing genai)
from dotenv import load_dotenv
load_dotenv()

# Gemini client setup - deferred initialization to allow for late env loading
genai_client = None
_genai_module = None

def _get_genai_client():
    """Lazy initialization of Gemini client."""
    global genai_client, _genai_module
    if genai_client is not None:
        return genai_client

    try:
        from google import genai as genai_mod
        _genai_module = genai_mod
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai_client = genai_mod.Client(api_key=api_key)
            print(f"[SpecGenerator] ✅ Gemini client initialized")
        else:
            print("[SpecGenerator] ⚠️ GEMINI_API_KEY not set")
    except ImportError as e:
        print(f"[SpecGenerator] Warning: google-genai not available: {e}")

    return genai_client


@dataclass
class SpecResult:
    """Result of spec generation."""
    success: bool
    spec_content: str
    error: Optional[str] = None
    images_described: int = 0


SPEC_GENERATION_PROMPT = """You are an expert industrial automation control system engineer.

Analyze this PDF document ("cahier des charges" / specification document) and generate a highly detailed, comprehensive, and well-organized Functional Design Specification (FDS) in Markdown format.

## YOUR TASK
The generated specification is the foundational document for building the automated control system. It must be extremely comprehensive, adhering to industrial automation best practices (e.g., inspired by ISA-88/IEC-61512 concepts for batch/discrete control). You must extract ALL details without abstracting or summarizing away important information.

1. **Extract All Specifications**: Include every requirement, constraint, and operational detail mentioned in the document. Do not leave any information behind.
2. **Physical Architecture & Components**: Detail all system components, their quantities, physical characteristics, roles, and how they interact. Provide exhaustive descriptions of the hardware, sensors, actuators, equipment modules, and mechanical parts.
3. **Procedural Control & Sequences**: Provide complete and step-by-step descriptions of the process flow, operational modes (Auto, Manual, Local), sequences, safety requirements (interlocks, emergency stops), and timing constraints.
4. **Describe Visuals in Detail**: For all images, P&IDs, timing diagrams, flowcharts, or wiring diagrams:
   - Identify the type of visual.
   - Describe ALL visible components, connections, states, and labels.
   - Explain the relationships and behavior depicted.

## WHAT NOT TO DO
- **NO Rigid Templates**: Do not force the output into a specific predefined template if it doesn't fit the source material. Instead, organize the document logically based on the input PDF, using a clear hierarchical Markdown schema.
- **NO Formatting Constraints**: Do not force data into rigid tables if it doesn't fit naturally. Describe physical components, their signals, and operational conditions naturally but comprehensively within the text.

## CONTENT ORGANIZATION GUIDELINES
Organize your comprehensive text so that an automation engineer can easily extract information for programming. A recommended (but flexible) structure is:
1. **System Overview & Scope**: Purpose of the automation and boundaries.
2. **Equipment & Instrumentation Specification**: Detailed breakdown of sensors, actuators, and hardware modules. (Crucial for I/O allocation).
3. **Modes of Operation & States**: Description of operating modes (e.g., Production, Maintenance) and state transitions (Start, Stop, Emergency, Reset).
4. **Functional Sequences & Logic**: Step-by-step process flows, parallel branches, step actions, and the exact transition conditions between steps.
5. **Safety & Interlocks**: Permissives, alarms, and emergency procedures.

## FORMATTING RULES
- Use a clear, well-structured hierarchical Markdown schema `#`, `##`, `###`.
- Use bold text `**` to highlight component names, states, signals, or critical constraints.
- Use bullet points for lists of components or step-by-step sequences.
- You may use relevant emojis to make sections visually identifiable.
- The document must accurately reflect the complexity and depth of the original PDF.

## LANGUAGE RULE
if spec in frensh all output should be in frensh
if english output english
"""


class SpecGenerator:
    """
    Generates spec.md from PDF using Gemini directly.
    
    This is independent of the ADK agent system.
    """
    
    def __init__(self, api_url: str = None):
        self._api_url_override = api_url
        self.model = "gemini-3.1-pro-preview"  # Gemini 3.1 for PDF analysis
        
    @property
    def api_url(self):
        if self._api_url_override:
            return self._api_url_override
        is_docker = os.getenv("IS_DOCKER", "false").lower() == "true"
        default_backend = "http://backend:3001" if is_docker else "http://localhost:3001"
        backend_url = os.getenv("BACKEND_URL", default_backend)
        return f"{backend_url}/api/simulation/save-spec"
    
    async def generate_spec_from_pdf(
        self,
        file_uri: str,
        mime_type: str = "application/pdf",
        project_path: Optional[str] = None,
        stream_callback=None,
        thinking_level: Optional[str] = None,
        model: Optional[str] = None
    ) -> SpecResult:
        """
        Generate spec.md content from an uploaded PDF with streaming support.

        Args:
            file_uri: Gemini file URI (from PDFHandler upload)
            mime_type: MIME type of the file
            project_path: Optional project path to save spec.md
            stream_callback: Optional async callback(text_chunk) for real-time streaming

        Returns:
            SpecResult with generated Markdown content
        """
        # Get the client lazily
        client = _get_genai_client()
        if not client:
            return SpecResult(
                success=False,
                spec_content="",
                error="Gemini client not available"
            )

        try:
            print(f"[SpecGenerator] 📄 Generating spec from: {file_uri}")

            # Build the content with PDF file reference
            contents = [
                {
                    "role": "user",
                    "parts": [
                        {"file_data": {"file_uri": file_uri, "mime_type": mime_type}},
                        {"text": SPEC_GENERATION_PROMPT}
                    ]
                }
            ]

            # Prepare config
            config = {}
            if thinking_level:
                config["thinking_config"] = {"include_thoughts": True, "thinking_level": thinking_level}

            # Determine which model to use (override default if provided)
            active_model = model or self.model

            # Use streaming if callback provided
            if stream_callback:
                # Stream the response in real-time
                spec_content = ""
                response_stream = client.models.generate_content_stream(
                    model=active_model,
                    contents=contents,
                    config=config
                )

                for chunk in response_stream:
                    if chunk.text:
                        spec_content += chunk.text
                        # Call the streaming callback with each chunk
                        await stream_callback(chunk.text)

                print(f"[SpecGenerator] ✅ Streamed spec ({len(spec_content)} chars) with model={active_model}, thinking_level={thinking_level}")
            else:
                # Non-streaming fallback
                response = client.models.generate_content(
                    model=active_model,
                    contents=contents,
                    config=config
                )
                spec_content = response.text
                print(f"[SpecGenerator] ✅ Generated spec ({len(spec_content)} chars) with model={active_model}, thinking_level={thinking_level}")

            # Count described images (rough estimate based on "Figure" occurrences)
            images_count = spec_content.lower().count("### figure")

            # Save to project if path provided
            if project_path:
                await self._save_spec(project_path, spec_content)

            return SpecResult(
                success=True,
                spec_content=spec_content,
                images_described=images_count
            )

        except Exception as e:
            print(f"[SpecGenerator] ❌ Generation failed: {e}")
            return SpecResult(
                success=False,
                spec_content="",
                error=str(e)
            )

    async def _save_spec(self, project_path: str, spec_content: str) -> bool:
        """Save spec.md to the project directory via backend API."""
        try:
            headers = {"x-agent-secret": "antigravity-local-agent"}
            async with aiohttp.ClientSession(headers=headers) as session:
                payload = {
                    "projectPath": project_path,
                    "specContent": spec_content
                }
                timeout = aiohttp.ClientTimeout(total=10)
                async with session.post(self.api_url, json=payload, timeout=timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        print(f"[SpecGenerator] 💾 Saved spec.md to: {data.get('savedPath')}")
                        return True
                    else:
                        error = await response.text()
                        print(f"[SpecGenerator] ⚠️ Save failed: {error}")
                        return False
        except Exception as e:
            print(f"[SpecGenerator] ⚠️ Save error: {e}")
            return False


# Singleton instance
spec_generator = SpecGenerator()

