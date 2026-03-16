import os
import json
from typing import Optional, AsyncGenerator
import google.generativeai as genai

class GeminiProvider:
    """Provider for Gemini 3.1 Flash Lite supporting streaming and thinking processes."""
    def __init__(self, model_name: str = "gemini-3.1-pro-preview"):
        # Get API key from environment
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("[GEMINI] Warning: GEMINI_API_KEY not set. Using dummy key for tool testing.")
            api_key = "DUMMY_KEY_FOR_TOOL_TESTING"
        
        genai.configure(api_key=api_key)
        self.model_name = model_name
        self.model = genai.GenerativeModel(model_name)
        print(f"[GEMINI] Initialized {model_name}")

    async def generate_stream(
        self, 
        prompt: str, 
        system_prompt: str = "",
        on_thinking: callable = None,
        on_tool: callable = None,
        thinking_level: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Streams text chunks from Gemini with thinking and tool usage callbacks.
        
        Args:
            prompt: User prompt
            system_prompt: System instructions
            on_thinking: Callback for thinking/reasoning tokens
            on_tool: Callback when tool is used
            thinking_level: Optional thinking level (minimal, low, medium, high)
        """
        print(f"[GEMINI] Streaming response for: {prompt[:50]}... (Model: {self.model_name}, Thinking: {thinking_level})")
        
        try:
            # Combine system prompt and user prompt
            full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
            
            # Prepare generation config
            generation_config = {
                "temperature": 0.3,
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 16384,
            }
            
            # Add thinking level if provided
            if thinking_level:
                generation_config["thinking_level"] = thinking_level
            
            # Stream response from Gemini
            response = await self.model.generate_content_async(
                full_prompt,
                stream=True,
                generation_config=generation_config
            )
            
            async for chunk in response:
                if chunk.text:
                    yield chunk.text
                    
        except Exception as e:
            print(f"[GEMINI] Streaming Error: {e}")
            yield f"Error: {str(e)}"
    
    async def generate(self, prompt: str, system_prompt: str = "", thinking_level: Optional[str] = None) -> str:
        """
        Generate complete response from Gemini
        """
        print(f"[GEMINI] Generating response for: {prompt[:50]}... (Model: {self.model_name}, Thinking: {thinking_level})")
        
        try:
            full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
            
            # Prepare generation config
            generation_config = {
                "temperature": 0.3,
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 16384,
            }
            
            # Add thinking level if provided
            if thinking_level:
                generation_config["thinking_level"] = thinking_level
                
            response = await self.model.generate_content_async(
                full_prompt,
                generation_config=generation_config
            )
            
            return response.text
            
        except Exception as e:
            print(f"[GEMINI] Error: {e}")
            return f"Error: {str(e)}"

# Global instance factory
def get_provider(model_name: str = "gemini-3.1-pro-preview"):
    """
    Returns the Gemini provider instance
    Uses gemini-3.1-pro-preview for best performance
    """
    return GeminiProvider(model_name=model_name)
