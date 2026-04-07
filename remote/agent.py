#!/usr/bin/env python3
"""
Veil Remote Desktop – Host Agent
Run this on the computer you want to share.
Usage:  python agent.py [server_url]
   eg:  python agent.py wss://secure.brightpathlearning.website
"""

import sys, json, time, threading, io, ssl, hashlib
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
    from PIL import Image, ImageDraw
except ImportError:
    print("Installing Pillow..."); import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw
try:
    import sounddevice as sd
except ImportError:
    print("Installing sounddevice..."); import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "sounddevice"])
    import sounddevice as sd
import numpy as np
try:
    np.zeros(1)
except Exception:
    print("Installing numpy..."); import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "numpy"])
    import numpy as np

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

SERVER = sys.argv[1] if len(sys.argv) > 1 else "wss://secure.brightpathlearning.website"
QUALITY = 40       # JPEG quality (lower = faster)
MAX_DIM = 1280     # max width for captured frames (0 = native, server caps to 1920)
FPS = 15           # target frames per second

room_code = None
ws_conn = None
running = True
viewer_count = 0
capture_started = False
screen_w = 0
screen_h = 0
img_w = 0    # width of the JPEG frames we send (after scaling)
img_h = 0
audio_device = None  # BlackHole device index (None = no audio)
AUDIO_SAMPLE_RATE = 48000
AUDIO_CHANNELS = 2
AUDIO_CHUNK = 4800  # 100ms chunks at 48kHz

# Frame dedup: skip frame if screen hasn't changed
_last_frame_hash = None


def quick_hash(raw_bytes):
    """Sample every 200th byte for a fast 'did screen change' check."""
    return hashlib.md5(raw_bytes[::200]).digest()


def capture_loop():
    """Continuously capture screen and send JPEG frames."""
    global screen_w, screen_h, img_w, img_h, _last_frame_hash
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # primary monitor
        screen_w = monitor["width"]
        screen_h = monitor["height"]
        while running and ws_conn and viewer_count > 0:
            interval = 1.0 / FPS  # re-read each frame so settings changes apply
            t0 = time.time()
            try:
                shot = sct.grab(monitor)
                raw = bytes(shot.raw)

                # Skip frame if screen hasn't changed
                h = quick_hash(raw)
                if h == _last_frame_hash:
                    elapsed = time.time() - t0
                    sleep_time = interval - elapsed
                    if sleep_time > 0:
                        time.sleep(sleep_time)
                    continue
                _last_frame_hash = h

                img = Image.frombytes("RGB", (shot.width, shot.height), shot.rgb)

                # Draw cursor onto the frame
                try:
                    mx, my = pyautogui.position()
                    mx = max(0, min(mx - monitor["left"], shot.width - 1))
                    my = max(0, min(my - monitor["top"], shot.height - 1))
                    draw = ImageDraw.Draw(img)
                    cs = 20
                    cursor_poly = [
                        (mx, my),
                        (mx, my + cs),
                        (mx + cs * 0.35, my + cs * 0.7),
                        (mx + cs * 0.55, my + cs * 1.05),
                        (mx + cs * 0.4, my + cs * 1.1),
                        (mx + cs * 0.2, my + cs * 0.75),
                        (mx - cs * 0.05, my + cs * 1.05),
                    ]
                    cursor_poly = [(int(x), int(y)) for x, y in cursor_poly]
                    draw.polygon(cursor_poly, fill="white", outline="black")
                except Exception:
                    pass

                # Scale down if MAX_DIM is set (0 = native, no scaling)
                if MAX_DIM > 0 and img.width > MAX_DIM:
                    ratio = MAX_DIM / img.width
                    # BILINEAR is 3-5x faster than LANCZOS with minimal quality loss at speed
                    img = img.resize((MAX_DIM, int(img.height * ratio)), Image.BILINEAR)

                img_w = img.width
                img_h = img.height
                buf = io.BytesIO()
                # subsampling=1 = 4:2:0 chroma — ~20% smaller files vs default
                img.save(buf, format="JPEG", quality=QUALITY, subsampling=1, optimize=False)
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


def find_audio_device():
    """Find BlackHole or similar loopback audio device."""
    try:
        devices = sd.query_devices()
        for i, d in enumerate(devices):
            name = d["name"].lower()
            if d["max_input_channels"] >= 2 and any(k in name for k in ["blackhole", "loopback", "soundflower", "virtual"]):
                print(f"[audio] Found loopback device: {d['name']} (index {i})")
                return i
        print("[audio] No loopback audio device found (BlackHole not installed).")
        print("[audio] Install BlackHole from https://existential.audio/blackhole/ for audio streaming.")
        return None
    except Exception as e:
        print(f"[audio] Could not query audio devices: {e}")
        return None


def audio_capture_loop():
    """Capture system audio via BlackHole and send to viewer."""
    global running
    try:
        def audio_callback(indata, frames, time_info, status):
            if not running or not ws_conn or viewer_count == 0:
                return
            try:
                pcm16 = (indata * 32767).astype(np.int16)
                raw = pcm16.tobytes()
                ws_conn.send(b'\x02' + raw, opcode=websocket.ABNF.OPCODE_BINARY)
            except Exception:
                pass

        with sd.InputStream(
            device=audio_device,
            samplerate=AUDIO_SAMPLE_RATE,
            channels=AUDIO_CHANNELS,
            blocksize=AUDIO_CHUNK,
            dtype="float32",
            callback=audio_callback,
        ):
            print("[audio] Streaming audio...")
            while running and ws_conn:
                time.sleep(0.1)
    except Exception as e:
        print(f"[audio] Audio capture error: {e}")


def scale_coords(data):
    """Scale from image coordinates (sent by viewer) to actual screen coordinates."""
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
            ctrl = data.get("ctrl", False)
            shift = data.get("shift", False)
            alt = data.get("alt", False)
            meta = data.get("meta", False)
            if key in ("ctrl", "shift", "alt", "command"):
                return
            mods = []
            if ctrl:  mods.append("ctrl")
            if shift:  mods.append("shift")
            if alt:    mods.append("alt")
            if meta:   mods.append("command")
            if mods:
                combo = "+".join(mods + [key])
                print(f"  [hotkey] {combo}")
                pyautogui.hotkey(*mods, key, _pause=False)
            elif len(key) == 1:
                pyautogui.typewrite(key, interval=0, _pause=False)
            else:
                print(f"  [key] {key}")
                pyautogui.press(key, _pause=False)

        elif t == "keyup":
            pass

        elif t == "scroll":
            x, y = scale_coords(data)
            pyautogui.moveTo(x, y, _pause=False)
            dy = data.get("deltaY", 0)
            clicks = max(1, abs(int(dy / 120))) * (-1 if dy > 0 else 1)
            pyautogui.scroll(clicks, _pause=False)

    except Exception as e:
        print(f"  [input error] {e}")


def handle_settings(data):
    """Update stream settings from the viewer."""
    global QUALITY, MAX_DIM, FPS, _last_frame_hash
    if "quality" in data:
        QUALITY = max(10, min(95, int(data["quality"])))
    if "maxDim" in data:
        MAX_DIM = int(data["maxDim"])  # 0 means native (no scaling)
    if "fps" in data:
        FPS = max(1, min(60, int(data["fps"])))
    _last_frame_hash = None  # force next frame to send after settings change
    print(f"  [settings] quality={QUALITY} resolution={MAX_DIM or 'native'} fps={FPS}")


def on_message(ws, message):
    global room_code, viewer_count, capture_started
    if isinstance(message, str):
        data = json.loads(message)
        if data.get("type") == "room_created":
            room_code = data["code"]
            print(f"\n{'='*50}")
            print(f"  ROOM CODE:  {room_code}")
            print(f"{'='*50}")
            print(f"  Share this code with the viewer.")
            print(f"  They open: {SERVER.replace('wss://','https://').replace('ws://','http://')}/remote")
            print(f"{'='*50}\n")
        elif data.get("type") == "viewer_joined":
            viewer_count = data.get("viewerCount", viewer_count + 1)
            print(f">> Viewer connected! ({viewer_count} watching) Streaming screen...")
            if not capture_started:
                capture_started = True
                t = threading.Thread(target=capture_loop, daemon=True)
                t.start()
                if audio_device is not None:
                    at = threading.Thread(target=audio_capture_loop, daemon=True)
                    at.start()
        elif data.get("type") == "viewer_left":
            viewer_count = data.get("viewerCount", max(0, viewer_count - 1))
            print(f">> Viewer disconnected. ({viewer_count} watching)")
        elif data.get("type") == "settings":
            handle_settings(data)
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
    ws.send(json.dumps({"type": "host_create"}))
    print("Connected to server. Creating room...")


def check_permissions():
    """Check macOS accessibility permissions needed for input control."""
    import platform
    if platform.system() != "Darwin":
        return
    try:
        pyautogui.moveTo(pyautogui.position()[0], pyautogui.position()[1], _pause=False)
        print("[ok] Input control available.")
    except Exception as e:
        print(f"[!] Input control may not work: {e}")
        print("[!] Go to System Settings > Privacy & Security > Accessibility")
        print("[!] and grant permission to Terminal (or your terminal app).")


def main():
    global audio_device
    print(f"Veil Remote Desktop Agent")
    check_permissions()
    audio_device = find_audio_device()
    print(f"Connecting to {SERVER}...")
    ws_url = SERVER.rstrip("/") + "/remote-ws"
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    try:
        import certifi
        sslopt = {"ca_certs": certifi.where()}
    except ImportError:
        sslopt = {"cert_reqs": ssl.CERT_NONE}
    ws.run_forever(sslopt=sslopt)


if __name__ == "__main__":
    main()
