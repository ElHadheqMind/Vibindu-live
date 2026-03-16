"""
FrontendRelayTools — Computer Use tools that work via WebSocket relay to the user's browser.

Instead of using pyautogui to control a headless display (which doesn't work in Cloud Run),
this class sends screenshot requests and click/type/scroll actions to the frontend browser
via WebSocket. The frontend captures its own DOM and executes actions on the real page.

This is the Docker/Cloud Run replacement for ComputerUseTools (pyautogui).
"""

import asyncio
import base64
import io
import logging
from PIL import Image

log = logging.getLogger("frontend_relay_tools")


class FrontendRelayTools:
    """
    Tools that relay actions to/from the user's actual browser via WebSocket.
    
    The WebSocket client (frontend) sends screenshots when requested,
    and receives click/type/scroll commands to execute on the DOM.
    """

    def __init__(self, websocket=None):
        self._websocket = websocket
        self._screenshot_event = asyncio.Event()
        self._latest_screenshot: str | None = None
        # Default screen size (will be updated from frontend)
        self.screen_width = 1280
        self.screen_height = 800

    def set_websocket(self, websocket):
        """Update the websocket reference (called when a new client connects)."""
        self._websocket = websocket

    def receive_screenshot(self, screenshot_b64: str):
        """Called when the frontend sends a screenshot in response to our request."""
        self._latest_screenshot = screenshot_b64
        self._screenshot_event.set()

    def update_screen_size(self, width: int, height: int):
        """Called when the frontend reports its viewport size."""
        self.screen_width = width
        self.screen_height = height
        log.info(f"Screen size updated: {self.screen_width}x{self.screen_height}")

    async def screenshot(self):
        """
        Request a screenshot from the frontend and wait for it.
        Returns base64-encoded PNG string, or None if unavailable.
        """
        if not self._websocket:
            log.warning("No WebSocket connected — no screenshot available")
            return None

        try:
            if self._websocket.client_state.value != 1:  # CONNECTED
                log.warning("WebSocket not connected - cannot send screenshot request")
                return None

            self._screenshot_event.clear()
            self._latest_screenshot = None

            await self._websocket.send_json({
                "type": "screenshot_request",
                "maxWidth": 1280,
                "maxHeight": 800,
                "quality": 0.8
            })

            try:
                await asyncio.wait_for(self._screenshot_event.wait(), timeout=30.0)
            except asyncio.TimeoutError:
                log.warning("Screenshot request timed out (30s). Frontend not responding.")
                return None

            if self._latest_screenshot:
                log.info(f"Screenshot received from frontend: {len(self._latest_screenshot)} chars")
                return self._latest_screenshot
            return None

        except Exception as e:
            log.error(f"Screenshot request failed: {e}")
            return None

    async def mouse_control(self, action: str, x_norm, y_norm) -> str:
        if not self._websocket:
            return "Error: No WebSocket connected"
        try:
            log.info(f"Sending mouse action to frontend: {action} at ({x_norm}, {y_norm})")
            await self._websocket.send_json({
                "type": "computer_action",
                "action": action,
                "x": x_norm,
                "y": y_norm
            })
            await asyncio.sleep(0.5)
            return f"Successfully performed {action} at ({x_norm}, {y_norm})"
        except Exception as e:
            log.error(f"Mouse control relay failed: {e}")
            return f"Error: {str(e)}"

    async def keyboard_control(self, action: str, text: str) -> str:
        if not self._websocket:
            return "Error: No WebSocket connected"
        try:
            log.info(f"Sending keyboard action to frontend: {action} '{text}'")
            await self._websocket.send_json({
                "type": "computer_action",
                "action": f"key_{action}",
                "text": text
            })
            await asyncio.sleep(0.3)
            return f"Successfully performed keyboard {action}"
        except Exception as e:
            log.error(f"Keyboard control relay failed: {e}")
            return f"Error: {str(e)}"

    async def scroll(self, direction: str = "down", amount: int = 3) -> str:
        if not self._websocket:
            return "Error: No WebSocket connected"
        try:
            await self._websocket.send_json({
                "type": "computer_action",
                "action": "scroll",
                "direction": direction,
                "amount": amount
            })
            await asyncio.sleep(0.3)
            return f"Scrolled {direction}"
        except Exception as e:
            log.error(f"Scroll relay failed: {e}")
            return f"Error: {str(e)}"

    async def wait(self, ms: int) -> str:
        await asyncio.sleep(ms / 1000.0)
        return f"Waited for {ms}ms"

