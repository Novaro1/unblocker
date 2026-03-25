#!/usr/bin/env python3
"""
Veil Remote Desktop – Host Agent
Run this on the computer you want to share.
Usage:  python agent.py [server_url]
   eg:  python agent.py wss://veilub.mooo.com
"""

import sys, json, time, struct, threading, io, base64, ssl
try:
    import websocket
except ImportError:
    print("Installing websocket-client..."); import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websocket-client"])
    import websocket
try:
    import mss
except ImportError:
    print("Installing mss..."); import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "mss"])
    import mss
try:
    import pyautogui
except ImportError:
    print("Installing pyautogui..."); import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyautogui"])
    import pyautogui
try:
    from PIL import Image
except ImportError:
    print("Installing Pillow..."); import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

SERVER = sys.argv[1] if len(sys.argv) > 1 else "wss://veilub.mooo.com"
QUALITY = 40       # JPEG quality (lower = faster)
MAX_DIM = 1280     # max width for captured frames
FPS = 15           # target frames per second

room_code = None
ws_conn = None
running = True
screen_w = 0
screen_h = 0
img_w = 0    # width of the JPEG frames we send (after scaling)
img_h = 0


def capture_loop():
    """Continuously capture screen and send JPEG frames."""
    global screen_w, screen_h, img_w, img_h
    interval = 1.0 / FPS
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # primary monitor
        screen_w = monitor["width"]
        screen_h = monitor["height"]
        while running and ws_conn:
            t0 = time.time()
            try:
                shot = sct.grab(monitor)
                img = Image.frombytes("RGB", (shot.width, shot.height), shot.rgb)
                # Scale down if needed
                if img.width > MAX_DIM:
                    ratio = MAX_DIM / img.width
                    img = img.resize((MAX_DIM, int(img.height * ratio)), Image.LANCZOS)
                img_w = img.width
                img_h = img.height
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=QUALITY, optimize=True)
                frame_data = buf.getvalue()
                # Send as binary: 1-byte type (0x01 = frame) + jpeg data
                if ws_conn:
                    ws_conn.send(b'\x01' + frame_data, opcode=websocket.ABNF.OPCODE_BINARY)
            except Exception as e:
                if running:
                    print(f"Capture error: {e}")
            elapsed = time.time() - t0
            sleep_time = interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)


def scale_coords(data):
    """Scale from image coordinates (sent by viewer) to actual screen coordinates."""
    # The viewer sends coords in the image's pixel space (max MAX_DIM wide).
    # We need to map to actual screen resolution.
    if screen_w and img_w:
        sx = screen_w / img_w
        sy = screen_h / img_h
    else:
        sx = sy = 1
    return int(data.get("x", 0) * sx), int(data.get("y", 0) * sy)


def handle_input(msg):
    """Process input events from the viewer."""
    try:
        data = json.loads(msg)
        t = data.get("type")

        if t == "mousemove":
            x, y = scale_coords(data)
            pyautogui.moveTo(x, y, _pause=False)

        elif t == "mousedown":
            x, y = scale_coords(data)
            btn = "left" if data.get("button", 0) == 0 else "right" if data.get("button") == 2 else "middle"
            print(f"  [click] {btn} @ ({x}, {y})")
            pyautogui.click(x, y, button=btn, _pause=False)

        elif t == "mouseup":
            pass  # click handles press+release

        elif t == "keydown":
            key = data.get("key", "")
            print(f"  [key] {key}")
            # Single printable characters: type them directly for reliability
            if len(key) == 1:
                pyautogui.typewrite(key, interval=0, _pause=False)
            else:
                pyautogui.press(key, _pause=False)

        elif t == "keyup":
            pass  # press handles down+up

        elif t == "scroll":
            x, y = scale_coords(data)
            pyautogui.moveTo(x, y, _pause=False)
            clicks = int(data.get("deltaY", 0) / -120) or (-1 if data.get("deltaY", 0) > 0 else 1)
            pyautogui.scroll(clicks, _pause=False)

    except Exception as e:
        print(f"  [input error] {e}")


def on_message(ws, message):
    if isinstance(message, str):
        data = json.loads(message)
        if data.get("type") == "room_created":
            global room_code
            room_code = data["code"]
            print(f"\n{'='*50}")
            print(f"  ROOM CODE:  {room_code}")
            print(f"{'='*50}")
            print(f"  Share this code with the viewer.")
            print(f"  They open: {SERVER.replace('wss://','https://').replace('ws://','http://')}/remote")
            print(f"{'='*50}\n")
        elif data.get("type") == "viewer_joined":
            print(">> Viewer connected! Streaming screen...")
            t = threading.Thread(target=capture_loop, daemon=True)
            t.start()
        elif data.get("type") == "viewer_left":
            print(">> Viewer disconnected.")
        elif data.get("type") == "input":
            handle_input(json.dumps(data.get("event", {})))
        elif data.get("type") == "error":
            print(f"Error: {data.get('message')}")


def on_error(ws, error):
    print(f"Connection error: {error}")


def on_close(ws, close_status_code, close_msg):
    global running
    running = False
    print("Disconnected from server.")


def on_open(ws):
    global ws_conn
    ws_conn = ws
    # Register as host and request a room
    ws.send(json.dumps({"type": "host_create"}))
    print("Connected to server. Creating room...")


def check_permissions():
    """Check macOS accessibility permissions needed for input control."""
    import platform
    if platform.system() != "Darwin":
        return
    try:
        import subprocess
        # Try a tiny mouse move to trigger the permission prompt
        pyautogui.moveTo(pyautogui.position()[0], pyautogui.position()[1], _pause=False)
        print("[ok] Input control available.")
    except Exception as e:
        print(f"[!] Input control may not work: {e}")
        print("[!] Go to System Settings > Privacy & Security > Accessibility")
        print("[!] and grant permission to Terminal (or your terminal app).")


def main():
    print(f"Veil Remote Desktop Agent")
    check_permissions()
    print(f"Connecting to {SERVER}...")
    ws_url = SERVER.rstrip("/") + "/remote-ws"
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    # Use default SSL context; fall back to unverified if certs aren't installed (common on macOS)
    try:
        import certifi
        sslopt = {"ca_certs": certifi.where()}
    except ImportError:
        sslopt = {"cert_reqs": ssl.CERT_NONE}
    ws.run_forever(sslopt=sslopt)


if __name__ == "__main__":
    main()
