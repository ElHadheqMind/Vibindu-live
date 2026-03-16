import asyncio
import base64
import io
import logging
import pyautogui
from PIL import Image
import time

log = logging.getLogger("computer_use_tools")

class ComputerUseTools:
    def __init__(self):
        # Disable pyautogui fail-safe for remote/automated use if needed, 
        # but better to keep it on for safety during development.
        pyautogui.FAILSAFE = True
        self.screen_width, self.screen_height = pyautogui.size()
        log.info(f"ComputerUseTools initialized. Screen size: {self.screen_width}x{self.screen_height}")

    def denormalize(self, x_norm, y_norm):
        """Convert 0-1000 normalized coordinates to actual screen pixels."""
        # Refresh size in case it changed (e.g. Xvfb start delay)
        self.screen_width, self.screen_height = pyautogui.size()
        x = int((x_norm / 1000) * self.screen_width)
        y = int((y_norm / 1000) * self.screen_height)
        return x, y

    async def screenshot(self):
        """Capture the current screen and return as base64 encoded PNG."""
        try:
            # Refresh size logs
            w, h = pyautogui.size()
            log.info(f"Capturing screenshot on {w}x{h} display")
            
            img = pyautogui.screenshot()
            
            # Check for black/empty screen (diagnostics)
            # Take a small thumbnail and check variance or just check if all pixels are the same
            thumb = img.resize((32, 32)).convert('L')
            extrema = thumb.getextrema()
            if extrema[0] == extrema[1]:
                log.warning(f"⚠️ SCREENSHOT DIAGNOSTIC: Screen is solid color (extrema: {extrema}). Display might not be initialized correctly.")
            
            # Save a debug copy to the shared volume
            try:
                img.save("/app/data/last_computer_screen.png")
            except Exception:
                pass
                
            buffered = io.BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            log.info(f"Screenshot captured: {len(img_str)} bytes")
            return img_str
        except Exception as e:
            log.error(f"Screenshot failed: {e}")
            # Return a tiny 1x1 black pixel as fallback to avoid NoneType errors downstream
            fallback_img = Image.new('RGB', (1, 1), color='black')
            buffered = io.BytesIO()
            fallback_img.save(buffered, format="PNG")
            return base64.b64encode(buffered.getvalue()).decode()

    async def mouse_control(self, action, x_norm, y_norm):
        """Perform mouse actions: move, click, double_click, drag."""
        try:
            x, y = self.denormalize(x_norm, y_norm)
            log.info(f"Mouse action: {action} at ({x}, {y}) [Normalized: {x_norm}, {y_norm}]")
            
            if action == "move":
                pyautogui.moveTo(x, y, duration=0.2)
            elif action == "click":
                pyautogui.click(x, y)
            elif action == "double_click":
                pyautogui.doubleClick(x, y)
            elif action == "drag":
                pyautogui.dragTo(x, y, duration=0.5)
            
            return f"Successfully performed {action}"
        except Exception as e:
            log.error(f"Mouse control failed: {e}")
            return f"Error: {str(e)}"

    async def keyboard_control(self, action, text):
        """Perform keyboard actions: type, press, hotkey."""
        try:
            log.info(f"Keyboard action: {action} with '{text}'")
            if action == "type":
                pyautogui.write(text, interval=0.05)
            elif action == "press":
                pyautogui.press(text)
            elif action == "hotkey":
                # Expecting text like "ctrl,c" or "alt,f4"
                keys = [k.strip() for k in text.split(",")]
                pyautogui.hotkey(*keys)
            
            return f"Successfully performed {action}"
        except Exception as e:
            log.error(f"Keyboard control failed: {e}")
            return f"Error: {str(e)}"

    async def wait(self, ms):
        """Wait for a specifies duration in milliseconds."""
        await asyncio.sleep(ms / 1000.0)
        return f"Waited for {ms}ms"
