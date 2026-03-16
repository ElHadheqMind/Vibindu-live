"""
Story Projectteller Agent — Refactored Modular Architecture
============================================================
Pipeline:  Prompt + Spec  →  Creative Plan  →  Parallel Asset Generation  →  HTML Composition

Components:
  - PlanningEngine   : Gemini text model → structured creative plan (JSON)
  - ImageGenerator   : Imagen 4.0 (Nano Banana) with targeted per-segment prompts
  - VideoGenerator   : Veo 3.0 Fast with cinematic prompts + async polling
  - AudioGenerator   : Gemini TTS streaming → WAV conversion
  - HTMLComposer     : Premium cinematic HTML with positioned assets
  - StoryProjectteller : Orchestrator tying all components together
"""

import os
import json
import struct
import asyncio
import base64
import logging
import traceback
import aiohttp
from pathlib import Path
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass, field, asdict
from dotenv import load_dotenv
from google import genai
from google.genai import types

active_websocket = None

async def broadcast_status(text: str):
    """Notify the Orchestrator's broadcast endpoint so the frontend sidebar can sync."""
    if active_websocket:
        try:
            await active_websocket.send_json({
                "type": "status",
                "text": text,
                "agent": "Creative Storyteller"
            })
        except Exception:
            pass

    try:
        IS_DOCKER = os.getenv("IS_DOCKER", "false").lower() == "true"
        PORT = os.getenv("PORT", "8000")
        ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", f"http://localhost:{PORT}" if IS_DOCKER else "http://localhost:3002")
        
        async with aiohttp.ClientSession() as session:
            payload = {
                "type": "status",
                "text": text,
                "agent": "Creative Storyteller"
            }
            async with session.post(f"{ORCHESTRATOR_URL}/api/broadcast", json=payload) as resp:
                pass
    except Exception as e:
        pass # log.warning would be spammy if not connected


# ─── Environment ──────────────────────────────────────────────────────────────
env_file = Path(__file__).parent / ".env"
if not env_file.exists():
    env_file = Path(__file__).parent.parent / ".env"
load_dotenv(env_file, override=True)

log = logging.getLogger("story_projectteller")
logging.basicConfig(level=logging.INFO)

# ─── Model Configuration ─────────────────────────────────────────────────────
TEXT_MODEL    = os.environ.get("STORY_TEXT_MODEL", "models/gemini-3.1-flash-lite-preview")
IMAGE_MODEL   = "models/imagen-4.0-generate-001"         # Nano Banana (Imagen 4.0)
VIDEO_MODEL   = "veo-3.1-fast-generate-preview"       # Veo 3.1 Fast
AUDIO_MODEL   = "gemini-2.5-flash-preview-tts"           # Gemini TTS

PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "hackathon-project")
LOCATION   = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")


# ─── Data Classes ─────────────────────────────────────────────────────────────
@dataclass
class SegmentPlan:
    """A single story segment with its text, narration script, and asset prompts."""
    text: str
    narration_text: str
    asset_type: str = "NONE"          # NONE | IMAGE | VIDEO
    image_prompt: Optional[str] = None
    video_prompt: Optional[str] = None
    # Filled after generation
    image_filename: Optional[str] = None
    video_filename: Optional[str] = None


@dataclass
class CreativePlan:
    """The full creative plan output from the Planning Engine."""
    title: str
    concept: str
    segments: List[SegmentPlan] = field(default_factory=list)


@dataclass
class GeneratedAssets:
    """Container for all generated asset paths and data."""
    images: Dict[int, str] = field(default_factory=dict)     # segment_idx → filename
    videos: Dict[int, str] = field(default_factory=dict)     # segment_idx → filename
    audio_path: Optional[str] = None
    images_b64: Dict[int, str] = field(default_factory=dict) # segment_idx → base64
    videos_b64: Dict[int, str] = field(default_factory=dict) # segment_idx → base64
    audio_b64: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# PLANNING ENGINE
# ═══════════════════════════════════════════════════════════════════════════════
class PlanningEngine:
    """
    Takes user prompt + spec content → structured CreativePlan.
    Uses Gemini text model to generate per-segment image/video prompts.
    """

    PLANNING_PROMPT = """You are a **Technical Creative Director** for industrial storytelling.

**YOUR INPUT:**
- SPEC (project specification): {spec_content}
- USER PROMPT: {user_prompt}

**YOUR TASK:**
Generate a comprehensive, cinematic, and technically grounded story plan as structured JSON. The story must provide a deep dive into the engineering project, featuring rich textual descriptions and strategically placed visual assets.

**RULES:**
1. Generate 5-8 narrative segments to provide significant depth.
2. `text`: 1-2 sentences of punchy display text.
3. `narration_text`: Immersive, detailed script (4-6 sentences) for TTS and full reading.
4. **THE MIX:** Use a variety of segment types:
   - **TEXT**: For pure technical exposition or transition (no visual).
   - **IMAGE**: For technical highlights (detailed Imagen 4.0 prompt).
   - **VIDEO**: At most ONE cinematic highlight (detailed Veo 3.0 prompt).
5. Ensure a balanced flow: e.g., TEXT -> IMAGE -> TEXT -> VIDEO -> TEXT -> IMAGE.
6. For IMAGE: use photorealistic industrial style (Nano Banana).
7. For VIDEO: use cinematic slow-motion (Veo 3.0).
8. **IMPORTANT**: The `image_prompt` and `video_prompt` MUST accurately describe the specific machinery, process, and current system details provided in the SPEC. Do not use generic industrial concepts; explicitly reference the actual logic, hardware, and workflow defined in this project.

**OUTPUT FORMAT (JSON ONLY):**
```json
{{
  "title": "Industrial Narrative Title",
  "concept": "Overarching theme of the demonstration",
  "segments": [
    {{
      "text": "Deep technical analysis.",
      "narration_text": "A comprehensive breakdown of the logic being applied here...",
      "asset_type": "TEXT",
      "image_prompt": null,
      "video_prompt": null
    }},
    {{
      "text": "Operational overview.",
      "narration_text": "Visualizing the system in action...",
      "asset_type": "IMAGE",
      "image_prompt": "Photorealistic industrial shot of...",
      "video_prompt": null
    }}
  ]
}}
```"""

    def __init__(self, client: genai.Client):
        self.client = client

    async def generate_plan(self, spec_content: str, user_prompt: str = "") -> CreativePlan:
        """Generate a structured creative plan from spec + user prompt."""
        log.info(f"[PlanningEngine] Generating creative plan with {TEXT_MODEL}...")
        await broadcast_status("Step 1/4: Analyzing specification and crafting narrative plan...")

        prompt = self.PLANNING_PROMPT.format(
            spec_content=spec_content,
            user_prompt=user_prompt or "Create an engaging technical story about this project"
        )

        try:
            response = self.client.models.generate_content(
                model=TEXT_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            raw = response.text
            log.info(f"[PlanningEngine] Raw response received (len={len(raw)})")

            # Handle markdown wrapping
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()

            data = json.loads(raw)
            plan = self._parse_plan(data)
            log.info(f"[PlanningEngine] Plan generated: '{plan.title}' with {len(plan.segments)} segments")
            return plan

        except Exception as e:
            log.error(f"[PlanningEngine] FAILED: {e}\n{traceback.format_exc()}")
            # Fallback plan
            return CreativePlan(
                title="A Journey Through Innovation",
                concept="An exploration of the engineering process.",
                segments=[
                    SegmentPlan(
                        text="The system comes to life as precision engineering meets intelligent automation.",
                        narration_text="Behold the vision where precision engineering meets intelligent automation.",
                        asset_type="IMAGE",
                        image_prompt="A photorealistic macro shot of an industrial PLC controller with glowing LED indicators in a clean modern lab, studio lighting, professional engineering photography"
                    ),
                    SegmentPlan(
                        text="Every component works in harmony, orchestrated by intelligent control logic.",
                        narration_text="Every component works in harmony, orchestrated by intelligent control logic that ensures safety and efficiency.",
                        asset_type="VIDEO",
                        video_prompt="Slow-motion cinematic close-up of an industrial robotic arm performing precise movements in a modern factory, clean lighting, 5 seconds"
                    ),
                ]
            )

    def _parse_plan(self, data: dict) -> CreativePlan:
        """Parse raw JSON into a typed CreativePlan."""
        segments = []
        for seg in data.get("segments", []):
            segments.append(SegmentPlan(
                text=seg.get("text", ""),
                narration_text=seg.get("narration_text", seg.get("text", "")),
                asset_type=seg.get("asset_type", "NONE").upper(),
                image_prompt=seg.get("image_prompt"),
                video_prompt=seg.get("video_prompt"),
            ))
        return CreativePlan(
            title=data.get("title", "Untitled Story"),
            concept=data.get("concept", ""),
            segments=segments,
        )


# ═══════════════════════════════════════════════════════════════════════════════
# IMAGE GENERATOR (Nano Banana / Imagen 4.0)
# ═══════════════════════════════════════════════════════════════════════════════
class ImageGenerator:
    """Generates images using Imagen 4.0 (Nano Banana) with targeted prompts."""

    def __init__(self, client: genai.Client):
        self.client = client

    async def generate(self, prompt: str, output_path: str, on_asset: Optional[Callable] = None) -> bool:
        """Generate a single image and save to output_path. Returns True on success."""
        log.info(f"[ImageGenerator/NanoBanana] Generating image: '{prompt[:80]}...'")
        await broadcast_status(f"🎨 Generating image illustration: '{prompt[:40]}...'")
        try:
            result = self.client.models.generate_images(
                model=IMAGE_MODEL,
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    output_mime_type="image/jpeg"
                )
            )
            if result.generated_images and len(result.generated_images) > 0:
                with open(output_path, "wb") as f:
                    f.write(result.generated_images[0].image.image_bytes)
                log.info(f"[ImageGenerator/NanoBanana] ✅ Saved to {output_path}")
                if on_asset:
                    b64_data = base64.b64encode(result.generated_images[0].image.image_bytes).decode("utf-8")
                    await on_asset("IMAGE", os.path.basename(output_path), b64_data)
                return True
            else:
                log.warning("[ImageGenerator/NanoBanana] No images returned by API")
                return False
        except Exception as e:
            log.error(f"[ImageGenerator/NanoBanana] ❌ Generation failed: {e}")
            if "Access token required" in str(e):
                log.warning("HINT: This model may require OAuth2 for some accounts.")
            return False

    async def generate_batch(self, prompts: Dict[int, str], output_dir: str, on_asset: Optional[Callable] = None) -> Dict[int, str]:
        """Generate multiple images in parallel. Returns {segment_idx: filename}."""
        results = {}
        tasks = []

        for idx, prompt in prompts.items():
            filename = f"scene_{idx}.jpg"
            path = os.path.join(output_dir, filename)
            tasks.append((idx, filename, self.generate(prompt, path, on_asset=on_asset)))

        # Run all in parallel
        gathered = await asyncio.gather(*[t[2] for t in tasks], return_exceptions=True)

        for i, (idx, filename, _) in enumerate(tasks):
            success = gathered[i]
            if isinstance(success, Exception):
                log.error(f"[ImageGenerator] Exception for segment {idx}: {success}")
                success = False
            if success:
                results[idx] = filename

        log.info(f"[ImageGenerator/NanoBanana] Batch complete: {len(results)}/{len(prompts)} images generated")
        return results


# ═══════════════════════════════════════════════════════════════════════════════
# VIDEO GENERATOR (Veo 3.0 Fast)
# ═══════════════════════════════════════════════════════════════════════════════
class VideoGenerator:
    """Generates videos using Veo 3.0 Fast with cinematic prompts."""

    def __init__(self, client: genai.Client):
        self.client = client

    async def generate(self, prompt: str, output_path: str, on_asset: Optional[Callable] = None) -> bool:
        """Generate a single video and save to output_path. Returns True on success."""
        log.info(f"[VideoGenerator/Veo] Generating video: '{prompt[:80]}...'")
        await broadcast_status(f"🎬 Starting video animation (Veo 3.1): '{prompt[:40]}...'")
        try:
            operation = self.client.models.generate_videos(
                model=VIDEO_MODEL,
                prompt=prompt,
                config=types.GenerateVideosConfig(
                    number_of_videos=1,
                    aspect_ratio="16:9",
                )
            )
            op_name = operation.name if hasattr(operation, 'name') else 'N/A'
            log.info(f"[VideoGenerator/Veo] Operation started: {op_name}")

            # Poll for completion (Veo is a long-running operation)
            max_retries = 30  # 30 * 10s = 5 minutes
            retries = 0
            while not operation.done and retries < max_retries:
                retries += 1
                if retries % 3 == 0:
                    log.info(f"[VideoGenerator/Veo] Polling operation... {retries*10}s elapsed")
                    await broadcast_status(f"🎬 Video generating... ({retries*10}s elapsed)")
                await asyncio.sleep(10)
                # Correct pattern: positional argument
                operation = self.client.operations.get(operation)

            if not operation.done:
                log.error(f"[VideoGenerator/Veo] ❌ Timed out waiting for video generation.")
                return False

            # After completion, the result is in operation.result
            response = operation.result
            if response and response.generated_videos and len(response.generated_videos) > 0:
                log.info(f"[VideoGenerator/Veo] Generated {len(response.generated_videos)} video(s).")
                video = response.generated_videos[0]
                
                # Use official SDK download and save pattern
                try:
                    # Download the remote file bytes into the object
                    self.client.files.download(file=video.video)
                    # Now save will work seamlessly
                    video.video.save(output_path)
                    log.info(f"[VideoGenerator/Veo] ✅ Saved to {output_path}")
                    if on_asset:
                        # video.video is a GenAI File object, we need to read the path locally to get bytes
                        with open(output_path, "rb") as f:
                            b64_data = base64.b64encode(f.read()).decode("utf-8")
                        await on_asset("VIDEO", os.path.basename(output_path), b64_data)
                    return True
                except Exception as save_err:
                    log.error(f"[VideoGenerator/Veo] SDK download or save failed: {save_err}")
                    return False

            log.warning(f"[VideoGenerator/Veo] No valid video results found in response.")
            return False

        except Exception as e:
            log.error(f"[VideoGenerator/Veo] ❌ Generation failed: {e}")
            return False

    async def generate_batch(self, prompts: Dict[int, str], output_dir: str, on_asset: Optional[Callable] = None) -> Dict[int, str]:
        """Generate multiple videos. Returns {segment_idx: filename}."""
        results = {}
        # Video generation is heavier, run sequentially to avoid quota issues
        for idx, prompt in prompts.items():
            filename = f"clip_{idx}.mp4"
            path = os.path.join(output_dir, filename)
            try:
                success = await self.generate(prompt, path, on_asset=on_asset)
                if success:
                    results[idx] = filename
            except Exception as e:
                log.error(f"[VideoGenerator] Exception for segment {idx}: {e}")

        log.info(f"[VideoGenerator/Veo] Batch complete: {len(results)}/{len(prompts)} videos generated")
        return results


# ═══════════════════════════════════════════════════════════════════════════════
# AUDIO GENERATOR (Gemini TTS)
# ═══════════════════════════════════════════════════════════════════════════════
class AudioGenerator:
    """Generates audio narration using Gemini TTS streaming model."""

    def __init__(self, client: genai.Client):
        self.client = client

    @staticmethod
    def _parse_audio_mime(mime_type: str) -> dict:
        bits = 16
        rate = 24000
        for param in mime_type.split(";"):
            param = param.strip()
            if param.lower().startswith("rate="):
                try:
                    rate = int(param.split("=", 1)[1])
                except:
                    pass
            elif param.startswith("audio/L"):
                try:
                    bits = int(param.split("L", 1)[1])
                except:
                    pass
        return {"bits": bits, "rate": rate}

    @staticmethod
    def _to_wav(audio_data: bytes, mime_type: str) -> bytes:
        params = AudioGenerator._parse_audio_mime(mime_type)
        bits = params["bits"]
        rate = params["rate"]
        channels = 1
        bytes_per_sample = bits // 8
        block_align = channels * bytes_per_sample
        byte_rate = rate * block_align
        data_size = len(audio_data)
        header = struct.pack(
            "<4sI4s4sIHHIIHH4sI",
            b"RIFF", 36 + data_size, b"WAVE", b"fmt ", 16,
            1, channels, rate, byte_rate, block_align, bits,
            b"data", data_size
        )
        return header + audio_data

    async def generate(self, text: str, output_path: str, on_asset: Optional[Callable] = None) -> bool:
        """Generate narration audio and save as WAV. Returns True on success."""
        log.info(f"[AudioGenerator/TTS] Generating narration ({len(text)} chars)...")
        await broadcast_status(f"🔊 Generating cinematic audio narration ({len(text)} chars)...")
        try:
            config = types.GenerateContentConfig(
                temperature=1,
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Zephyr"
                        )
                    )
                ),
            )

            audio_buffer = b""
            last_mime = "audio/L16;rate=24000"

            # Clean narration text from markdown artifacts for smoother TTS
            cleaned_text = text.replace("**", "").replace("_", "").replace("#", "").strip()

            for chunk in self.client.models.generate_content_stream(
                model=AUDIO_MODEL,
                contents=f"Read this story narration with professional warmth and technical precision. {cleaned_text}",
                config=config,
            ):
                if chunk.parts and chunk.parts[0].inline_data:
                    inline = chunk.parts[0].inline_data
                    audio_buffer += inline.data
                    if inline.mime_type:
                        last_mime = inline.mime_type

            if audio_buffer and len(audio_buffer) > 100:
                wav = self._to_wav(audio_buffer, last_mime)
                with open(output_path, "wb") as f:
                    f.write(wav)
                log.info(f"[AudioGenerator/TTS] ✅ Saved narration ({len(wav)} bytes) to {output_path}")
                if on_asset:
                    b64_data = base64.b64encode(wav).decode("utf-8")
                    await on_asset("AUDIO", os.path.basename(output_path), b64_data)
                return True

            log.warning("[AudioGenerator/TTS] Empty audio buffer returned")
            return False

        except Exception as e:
            log.error(f"[AudioGenerator/TTS] ❌ Generation failed: {e}")
            return False


# ═══════════════════════════════════════════════════════════════════════════════
# HTML COMPOSER
# ═══════════════════════════════════════════════════════════════════════════════
class HTMLComposer:
    """Assembles a premium, cinematic HTML page from the plan + generated assets (Base64)."""

    TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=Outfit:wght@300;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #030303;
            --text: #f8fafc;
            --text-dim: #94a3b8;
            --accent: #818cf8;
            --accent-glow: rgba(129, 140, 248, 0.4);
            --card: #0f172a;
            --glass: rgba(255, 255, 255, 0.05);
            --border: rgba(255, 255, 255, 0.1);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: var(--bg);
            color: var(--text);
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
            overflow-x: hidden;
            scroll-behavior: smooth;
        }

        .hero {
            min-height: 40vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 80px 20px 40px;
            background: radial-gradient(circle at top, rgba(99,102,241,0.15) 0%, transparent 70%);
        }
        h1 {
            font-family: 'Outfit', sans-serif;
            font-size: clamp(2rem, 5vw, 4rem);
            font-weight: 600;
            background: linear-gradient(135deg, #fff 0%, #818cf8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }
        .concept {
            color: var(--text-dim);
            font-size: 1.1rem;
            max-width: 700px;
            margin: 0 auto;
        }

        .controls {
            position: sticky;
            top: 20px;
            z-index: 1000;
            display: flex;
            justify-content: center;
            padding-bottom: 60px;
        }
        .btn-audio {
            background: var(--accent);
            color: white;
            border: none;
            padding: 14px 28px;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 10px 30px var(--accent-glow);
            transition: 0.3s;
        }
        .btn-audio:hover { transform: translateY(-2px); box-shadow: 0 15px 40px var(--accent-glow); }

        .container { max-width: 960px; margin: 0 auto; padding: 0 24px 100px; }

        .segment {
            margin-bottom: 120px;
            opacity: 0; transform: translateY(30px);
            transition: opacity 1s, transform 1s;
        }
        .segment.visible { opacity: 1; transform: translateY(0); }

        .seg-header { margin-bottom: 32px; }
        .seg-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            background: var(--glass);
            border: 1px solid var(--border);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--accent);
            margin-bottom: 16px;
        }
        .seg-text { font-family: 'Outfit', sans-serif; font-size: 2rem; margin-bottom: 16px; font-weight: 500; letter-spacing: -0.01em; }
        .seg-narration {
            font-size: 1.2rem;
            color: var(--text-dim);
            border-left: 3px solid var(--accent);
            padding-left: 20px;
            margin-bottom: 32px;
            font-style: italic;
            line-height: 1.8;
            font-weight: 300;
        }

        .media-container {
            border-radius: 16px;
            overflow: hidden;
            background: #000;
            border: 1px solid var(--border);
            box-shadow: 0 30px 60px rgba(0,0,0,0.6);
            margin-top: 20px;
        }
        .media-container img, .media-container video { width: 100%; display: block; transition: transform 0.5s; }
        .media-container:hover img { transform: scale(1.02); }

        /* Text-only segments styling */
        .segment.text-only {
            text-align: center;
            max-width: 800px;
            margin-left: auto;
            margin-right: auto;
            padding: 60px 40px;
            background: var(--surface);
            border-radius: 24px;
            border: 1px solid var(--border);
        }
        .segment.text-only .seg-narration {
            border-left: none;
            padding-left: 0;
            margin-top: 24px;
        }

        .footer { text-align: center; padding: 100px 0; border-top: 1px solid var(--border); opacity: 0.4; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="hero">
        <div>
            <h1>{{TITLE}}</h1>
            <p class="concept">{{CONCEPT}}</p>
        </div>
    </div>

    <div class="controls">
        <button class="btn-audio" onclick="toggleAudio()">
            <span id="audioIcon">▷</span>
            <span id="btnText">Listen to Executive Summary</span>
        </button>
        <audio id="storyAudio" src="{{AUDIO_B64}}"></audio>
    </div>

    <div class="container" id="segments">
        {{SEGMENTS}}
    </div>

    <div class="footer">Crafted by Creative Storyteller — Portable Base64 Edition</div>

    <script>
        const audio = document.getElementById('storyAudio');
        const btnText = document.getElementById('btnText');
        const audioIcon = document.getElementById('audioIcon');

        function toggleAudio() {
            if (audio.paused) {
                audio.play();
                btnText.innerText = "Pause Narration";
                audioIcon.innerText = "⏸";
            } else {
                audio.pause();
                btnText.innerText = "Resume Narration";
                audioIcon.innerText = "▷";
            }
        }

        audio.onended = () => {
            btnText.innerText = "Replay Narration";
            audioIcon.innerText = "↺";
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add('visible');
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.segment').forEach(seg => observer.observe(seg));
    </script>
</body>
</html>"""

    @staticmethod
    def compose(plan: CreativePlan, assets: GeneratedAssets) -> str:
        """Build final HTML string from plan + assets (using Base64 data URIs for portability)."""
        segments_html = ""

        for i, seg in enumerate(plan.segments):
            type_label = "Tech Insight" if seg.asset_type == "TEXT" else ("Image Highlight" if seg.asset_type == "IMAGE" else "Cinematic Video")
            
            # Special class for text-only segments to give them more presence
            extra_class = "text-only" if seg.asset_type == "TEXT" else ""
            
            segments_html += f'<div class="segment {extra_class}">\n'
            segments_html += f'  <div class="seg-header">\n'
            segments_html += f'    <div class="seg-badge">{type_label} {i+1}</div>\n'
            segments_html += f'    <div class="seg-text">{seg.text}</div>\n'
            segments_html += f'    <div class="seg-narration">{seg.narration_text}</div>\n'
            segments_html += f'  </div>\n'

            # Media embedding via Base64
            if seg.asset_type == "IMAGE" and i in assets.images_b64:
                b64 = assets.images_b64[i]
                segments_html += f'  <div class="media-container"><img src="data:image/jpeg;base64,{b64}" alt="Scene {i+1}"></div>\n'
            elif seg.asset_type == "VIDEO" and i in assets.videos_b64:
                b64 = assets.videos_b64[i]
                segments_html += f'  <div class="media-container"><video src="data:video/mp4;base64,{b64}" controls loop autoplay muted playsinline></video></div>\n'
            
            segments_html += '</div>\n'

        html = HTMLComposer.TEMPLATE
        html = html.replace("{{TITLE}}", plan.title)
        html = html.replace("{{CONCEPT}}", plan.concept)
        html = html.replace("{{SEGMENTS}}", segments_html)
        
        # Audio embedding
        audio_src = ""
        if assets.audio_b64:
            audio_src = f"data:audio/wav;base64,{assets.audio_b64}"
        html = html.replace("{{AUDIO_B64}}", audio_src)
        
        return html


# ═══════════════════════════════════════════════════════════════════════════════
# STORY PROJECTTELLER — MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════
class StoryProjectteller:
    """
    Creative Storyteller Agent — Orchestrator
    Coordinates: PlanningEngine → ImageGenerator + VideoGenerator + AudioGenerator → HTMLComposer
    """

    def __init__(self):
        env_file = Path(__file__).parent / ".env"
        load_dotenv(env_file, override=True)

        api_key = os.environ.get("GEMINI_API_KEY")
        use_vertex = os.environ.get("USE_VERTEX", "false").lower() == "true"

        if not api_key and not use_vertex:
            log.error("CRITICAL: GEMINI_API_KEY is not set!")

        try:
            if use_vertex:
                self.client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)
                log.info(f"Using Vertex AI on {PROJECT_ID}/{LOCATION}")
            else:
                masked = f"{api_key[:10]}...{api_key[-5:]}" if api_key and len(api_key) > 15 else "***"
                log.info(f"Initializing with API Key: {masked}")
                self.client = genai.Client(
                    api_key=api_key,
                    http_options={'api_version': 'v1beta'}
                )
                log.info(f"Using Gemini API Studio (v1beta). Models: text={TEXT_MODEL}, img={IMAGE_MODEL}, vid={VIDEO_MODEL}, tts={AUDIO_MODEL}")

            # Validate connectivity
            try:
                models = list(self.client.models.list())
                log.info(f"Connectivity verified. {len(models)} models available.")
            except Exception as ve:
                log.warning(f"Model list check failed: {ve}. Proceeding anyway.")

        except Exception as e:
            log.error(f"Storyteller Initialization Failed: {e}")
            raise

        # Initialize sub-components
        self.planner     = PlanningEngine(self.client)
        self.img_gen     = ImageGenerator(self.client)
        self.vid_gen     = VideoGenerator(self.client)
        self.audio_gen   = AudioGenerator(self.client)

    async def tell_story(self, spec_content: str, output_dir: str = ".", on_asset_generated: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Main pipeline:
        1. Plan → CreativePlan with per-segment prompts
        2. Generate assets in parallel (images, videos, audio)
        3. Compose HTML
        4. Return result with base64 data
        """
        log.info(f"═══ Storyteller Pipeline Starting ═══")
        log.info(f"Output dir: {output_dir}")

        # Ensure directories
        os.makedirs(output_dir, exist_ok=True)
        
        # Avoid double nesting: if output_dir already ends with StoryExperience, use it
        if os.path.basename(output_dir.rstrip("\\/")) == "StoryExperience":
            experience_dir = output_dir
            log.info(f"Using existing StoryExperience directory: {experience_dir}")
        else:
            experience_dir = os.path.join(output_dir, "StoryExperience")
            os.makedirs(experience_dir, exist_ok=True)
            log.info(f"Created new StoryExperience directory: {experience_dir}")

        # ─── STEP 1: Parse user prompt from combined spec_content ─────────
        user_prompt = ""
        actual_spec = spec_content
        if "USER PROMPT:" in spec_content:
            parts = spec_content.split("USER PROMPT:", 1)
            actual_spec = parts[0].replace("CONTEXT SPECIFICATION:", "").strip()
            user_prompt = parts[1].strip()

        # ─── STEP 2: Planning ────────────────────────────────────────────
        log.info("STEP 1/4: Creative Planning...")
        plan = await self.planner.generate_plan(actual_spec, user_prompt)

        # ─── STEP 3: Collect prompts for batch generation ─────────────────
        image_prompts: Dict[int, str] = {}
        video_prompts: Dict[int, str] = {}

        for i, seg in enumerate(plan.segments):
            if seg.asset_type == "IMAGE" and seg.image_prompt:
                image_prompts[i] = seg.image_prompt
            elif seg.asset_type == "VIDEO" and seg.video_prompt:
                video_prompts[i] = seg.video_prompt

        log.info(f"STEP 2/4: Asset Generation — {len(image_prompts)} images, {len(video_prompts)} videos")
        await broadcast_status(f"Step 2/4: Asset Generation — {len(image_prompts)} images, {len(video_prompts)} videos")

        # ─── STEP 4: Generate images, videos, and audio in parallel ───────
        # Build full narration text
        narration_full = " ".join([seg.narration_text for seg in plan.segments])
        audio_path = os.path.join(experience_dir, "story_narration.wav")

        # Launch all generators concurrently
        img_task = self.img_gen.generate_batch(image_prompts, experience_dir, on_asset=on_asset_generated)
        vid_task = self.vid_gen.generate_batch(video_prompts, experience_dir, on_asset=on_asset_generated)
        audio_task = self.audio_gen.generate(narration_full, audio_path, on_asset=on_asset_generated)

        image_results, video_results, audio_success = await asyncio.gather(
            img_task, vid_task, audio_task,
            return_exceptions=True
        )

        # Handle exceptions from gather
        if isinstance(image_results, Exception):
            log.error(f"Image batch failed: {image_results}")
            image_results = {}
        if isinstance(video_results, Exception):
            log.error(f"Video batch failed: {video_results}")
            video_results = {}
        if isinstance(audio_success, Exception):
            log.error(f"Audio generation failed: {audio_success}")
            audio_success = False

        # Load assets into Base64 for the composer
        images_b64 = {}
        for idx, filename in image_results.items():
            try:
                with open(os.path.join(experience_dir, filename), "rb") as f:
                    images_b64[idx] = base64.b64encode(f.read()).decode("utf-8")
            except Exception as e:
                log.error(f"Could not encode image {filename}: {e}")

        videos_b64 = {}
        for idx, filename in video_results.items():
            try:
                with open(os.path.join(experience_dir, filename), "rb") as f:
                    videos_b64[idx] = base64.b64encode(f.read()).decode("utf-8")
            except Exception as e:
                log.error(f"Could not encode video {filename}: {e}")

        audio_b64 = None
        if audio_success and os.path.exists(audio_path):
            try:
                with open(audio_path, "rb") as f:
                    audio_b64 = base64.b64encode(f.read()).decode("utf-8")
            except Exception as e:
                log.error(f"Could not encode audio: {e}")

        assets = GeneratedAssets(
            images=image_results,
            videos=video_results,
            audio_path=audio_path if audio_success else None,
            images_b64=images_b64,
            videos_b64=videos_b64,
            audio_b64=audio_b64
        )

        log.info(f"STEP 3/4: Assets complete — {len(assets.images)} images, {len(assets.videos)} videos, audio={'✅' if audio_success else '❌'}")
        await broadcast_status(f"Step 3/4: Assets complete — {len(assets.images)} images, {len(assets.videos)} videos, audio={'✅' if audio_success else '❌'}")

        # ─── STEP 5: Compose HTML ────────────────────────────────────────
        log.info("STEP 4/4: HTML Composition (Portable Mode)...")
        await broadcast_status("Step 4/4: HTML Composition...")
        final_html = HTMLComposer.compose(plan, assets)

        story_path = os.path.join(experience_dir, "Story.html")
        with open(story_path, "w", encoding="utf-8") as f:
            f.write(final_html)
        log.info(f"Story page written to '{story_path}'")

        # Use the first generated image for preview
        image_preview_b64 = None
        if assets.images_b64:
            first_idx = min(assets.images_b64.keys())
            image_preview_b64 = assets.images_b64[first_idx]

        log.info(f"═══ Storyteller Pipeline Complete ═══")
        log.info(f"  Title: {plan.title}")
        log.info(f"  Segments: {len(plan.segments)}")

        # Collect all assets to send over the wire
        all_assets = []
        for idx, filename in assets.images.items():
            if idx in assets.images_b64:
                all_assets.append({"filename": filename, "b64": assets.images_b64[idx]})
        for idx, filename in assets.videos.items():
            if idx in assets.videos_b64:
                all_assets.append({"filename": filename, "b64": assets.videos_b64[idx]})
        if assets.audio_path and assets.audio_b64:
            all_assets.append({"filename": os.path.basename(assets.audio_path), "b64": assets.audio_b64})

        return {
            "story": final_html,
            "assets": all_assets,
            "audioB64": audio_b64,
            "imageB64": image_preview_b64,
            "filename": "Story.html",
            "plan": {
                "title": plan.title,
                "concept": plan.concept,
                "segment_count": len(plan.segments),
                "image_count": len(assets.images),
                "video_count": len(assets.videos),
                "audio_ready": audio_b64 is not None,
            }
        }


# ═══════════════════════════════════════════════════════════════════════════════
# CLI ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import sys

    agent = StoryProjectteller()
    base_dir = os.path.dirname(__file__)

    custom_prompt = None
    if len(sys.argv) > 1:
        custom_prompt = " ".join(sys.argv[1:])

    spec_path = os.path.abspath(os.path.join(base_dir, "..", "..", "test_project", "spec.md"))

    spec_content = "A high-speed robot arm painting intricate patterns."
    if os.path.exists(spec_path):
        with open(spec_path, "r") as f:
            spec_content = f.read()

    if custom_prompt:
        spec_content = f"CONTEXT SPECIFICATION:\n{spec_content}\n\nUSER PROMPT:\n{custom_prompt}"

    try:
        result = asyncio.run(agent.tell_story(spec_content, output_dir=base_dir))
        print("\n===STORY_RESULT===")
        summary = {
            "filename": result["filename"],
            "plan": result.get("plan"),
            "audioReady": result.get("audioB64") is not None,
            "imageReady": result.get("imageB64") is not None,
        }
        print(json.dumps(summary, indent=2))
        print("===END_STORY_RESULT===\n")
    except Exception as e:
        log.error(traceback.format_exc())
        print("\n===STORY_RESULT===")
        print(json.dumps({"error": str(e)}))
        print("===END_STORY_RESULT===\n")
