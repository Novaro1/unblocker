#!/usr/bin/env python3
"""
Veil Remote Desktop – Host Agent
WebRTC mode (default): video/audio goes peer-to-peer, zero server RAM used for media.
JPEG fallback: used automatically if aiortc can't be installed.

Usage:  python agent.py [server_url]
"""

import sys, json, time, threading, io, ssl, hashlib, fractions

def pip(pkg):
    import subprocess
    print(f"Installing {pkg}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try: import mss
except ImportError: pip("mss"); import mss

try: import pyautogui
except ImportError: pip("pyautogui"); import pyautogui

try: from PIL import Image, ImageDraw
except ImportError: pip("Pillow"); from PIL import Image, ImageDraw

try: import numpy as np
except ImportError: pip("numpy"); import numpy as np

try: import sounddevice as sd
except ImportError: pip("sounddevice"); import sounddevice as sd

# Try WebRTC stack
WEBRTC = False
try:
    import av
    from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
    from aiortc.sdp import candidate_from_sdp
    WEBRTC = True
except ImportError:
    pip("aiortc")
    try:
        import av
        from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
        from aiortc.sdp import candidate_from_sdp
        WEBRTC = True
    except Exception as e:
        print(f"[!] WebRTC unavailable ({e}), using JPEG fallback (video will relay through server)")

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

SERVER = sys.argv[1] if len(sys.argv) > 1 else "wss://secure.brightpathlearning.website"

# ── Shared mutable settings (updated by viewer settings messages) ─────────────
MAX_DIM = 1280
FPS = 15
QUALITY = 40

# ── Shared screen capture (one background thread, all viewers read from it) ───
_latest_raw_frame = None   # av.VideoFrame when WEBRTC, PIL Image when JPEG
_capture_lock = threading.Lock()
_capture_running = False

def start_capture():
    global _capture_running
    if _capture_running:
        return
    _capture_running = True
    threading.Thread(target=_capture_thread, daemon=True).start()

def _capture_thread():
    global _latest_raw_frame
    last_hash = None
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        while _capture_running:
            t0 = time.time()
            try:
                shot = sct.grab(monitor)
                raw = bytes(shot.raw)
                # Quick hash of sampled bytes — skip frame if screen hasn't changed
                h = hashlib.md5(raw[::200]).digest()
                if h != last_hash:
                    last_hash = h
                    img = Image.frombytes("RGB", (shot.width, shot.height), shot.rgb)
                    # Draw cursor
                    try:
                        mx, my = pyautogui.position()
                        mx = max(0, min(mx - monitor["left"], shot.width - 1))
                        my = max(0, min(my - monitor["top"], shot.height - 1))
                        draw = ImageDraw.Draw(img)
                        cs = 20
                        poly = [
                            (mx, my), (mx, my + cs),
                            (mx + cs * .35, my + cs * .7), (mx + cs * .55, my + cs * 1.05),
                            (mx + cs * .4, my + cs * 1.1), (mx + cs * .2, my + cs * .75),
                            (mx - cs * .05, my + cs * 1.05),
                        ]
                        draw.polygon([(int(x), int(y)) for x, y in poly], fill="white", outline="black")
                    except Exception:
                        pass
                    # Scale — BILINEAR is 3-5x faster than LANCZOS
                    if MAX_DIM > 0 and img.width > MAX_DIM:
                        img = img.resize((MAX_DIM, int(img.height * MAX_DIM / img.width)), Image.BILINEAR)
                    with _capture_lock:
                        _latest_raw_frame = av.VideoFrame.from_image(img) if WEBRTC else img
            except Exception as e:
                print(f"[capture] {e}")
            elapsed = time.time() - t0
            time.sleep(max(0, 1 / 30 - elapsed))  # capture at up to 30fps

# ── Audio: one stream, broadcast to multiple per-viewer queues ────────────────
_audio_queues: dict = {}   # viewer_id -> asyncio.Queue
_audio_lock = threading.Lock()

def find_audio_device():
    try:
        for i, d in enumerate(sd.query_devices()):
            name = d["name"].lower()
            if d["max_input_channels"] >= 2 and any(
                k in name for k in ["blackhole", "loopback", "soundflower", "virtual"]
            ):
                print(f"[audio] Found: {d['name']}")
                return i
    except Exception as e:
        print(f"[audio] {e}")
    print("[audio] No loopback device found (install BlackHole for audio streaming).")
    return None

def start_audio_broadcast(device):
    def callback(indata, frames, time_info, status):
        pcm = (indata * 32767).astype(np.int16).copy()
        with _audio_lock:
            for q in list(_audio_queues.values()):
                try:
                    q.put_nowait(pcm)
                except Exception:
                    pass  # queue full — drop chunk for this viewer

    def run():
        with sd.InputStream(device=device, samplerate=48000, channels=2,
                            blocksize=960, dtype="float32", callback=callback):
            while _capture_running:
                time.sleep(1)

    threading.Thread(target=run, daemon=True).start()
    print("[audio] Streaming audio...")

# ── Input handling ─────────────────────────────────────────────────────────────
def handle_input_sync(event):
    try:
        t = event.get("type")
        if t == "mousemove":
            pyautogui.moveTo(event["x"], event["y"], _pause=False)
        elif t == "mousedown":
            btn = ["left", "middle", "right"][min(event.get("button", 0), 2)]
            pyautogui.click(event["x"], event["y"], button=btn, _pause=False)
        elif t == "scroll":
            pyautogui.moveTo(event["x"], event["y"], _pause=False)
            dy = event.get("deltaY", 0)
            pyautogui.scroll(max(1, abs(int(dy / 120))) * (-1 if dy > 0 else 1), _pause=False)
        elif t == "keydown":
            key = event.get("key", "")
            if key in ("ctrl", "shift", "alt", "command"):
                return
            mods = [m for m, f in [
                ("ctrl", event.get("ctrl")), ("shift", event.get("shift")),
                ("alt", event.get("alt")),   ("command", event.get("meta")),
            ] if f]
            if mods:
                pyautogui.hotkey(*mods, key, _pause=False)
            elif len(key) == 1:
                pyautogui.typewrite(key, interval=0, _pause=False)
            else:
                pyautogui.press(key, _pause=False)
    except Exception as e:
        print(f"[input] {e}")

# ─────────────────────────────────────────────────────────────────────────────
# WebRTC mode
# ─────────────────────────────────────────────────────────────────────────────
if WEBRTC:
    import asyncio

    class ScreenTrack(MediaStreamTrack):
        """Video track that reads from the shared capture thread."""
        kind = "video"
        _CLOCK = 90000

        def __init__(self):
            super().__init__()
            self._ts = 0
            self._start = None

        async def recv(self):
            ptime = 1.0 / FPS
            if self._start is None:
                self._start = time.time()
            else:
                self._ts += int(ptime * self._CLOCK)
                wait = self._start + (self._ts / self._CLOCK) - time.time()
                if wait > 0:
                    await asyncio.sleep(wait)

            with _capture_lock:
                f = _latest_raw_frame

            if f is None:
                blank = av.VideoFrame(width=MAX_DIM or 1280, height=720, format="yuv420p")
                blank.pts = self._ts
                blank.time_base = fractions.Fraction(1, self._CLOCK)
                return blank

            yuv = f.reformat(format="yuv420p").copy()
            yuv.pts = self._ts
            yuv.time_base = fractions.Fraction(1, self._CLOCK)
            return yuv

    class AudioTrack(MediaStreamTrack):
        """Audio track per viewer that reads from its own queue."""
        kind = "audio"

        def __init__(self, viewer_id):
            super().__init__()
            self._vid = viewer_id
            self._q = asyncio.Queue(maxsize=30)
            with _audio_lock:
                _audio_queues[viewer_id] = self._q
            self._ts = 0

        def stop(self):
            super().stop()
            with _audio_lock:
                _audio_queues.pop(self._vid, None)

        async def recv(self):
            pcm = await self._q.get()
            frame = av.AudioFrame.from_ndarray(pcm.T.reshape(2, -1), format="s16", layout="stereo")
            frame.sample_rate = 48000
            frame.pts = self._ts
            frame.time_base = fractions.Fraction(1, 48000)
            self._ts += frame.samples
            return frame

    async def run_webrtc(audio_dev):
        global MAX_DIM, FPS, QUALITY

        try:
            import websockets
        except ImportError:
            pip("websockets>=12")
            import websockets

        ws_url = SERVER.rstrip("/") + "/remote-ws"
        try:
            import certifi
            ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

        pcs: dict = {}  # viewer_id -> RTCPeerConnection

        print(f"Connecting to {SERVER}...")
        connect_kwargs = {"ssl": ssl_ctx} if ws_url.startswith("wss") else {}
        async with websockets.connect(ws_url, **connect_kwargs) as ws:
            await ws.send(json.dumps({"type": "host_create", "mode": "webrtc"}))
            if audio_dev is not None:
                start_audio_broadcast(audio_dev)

            async for raw in ws:
                msg = json.loads(raw)
                mt = msg.get("type")

                if mt == "room_created":
                    code = msg["code"]
                    print(f"\n{'='*50}")
                    print(f"  ROOM CODE:  {code}")
                    print(f"{'='*50}")
                    print(f"  Open: {SERVER.replace('wss://','https://').replace('ws://','http://')}/remote")
                    print(f"{'='*50}\n")
                    start_capture()

                elif mt == "viewer_joined":
                    vid = msg["viewerId"]
                    count = msg.get("viewerCount", 1)
                    print(f">> Viewer {vid[:8]} joined ({count} watching) — creating WebRTC connection")

                    pc = RTCPeerConnection()
                    pcs[vid] = pc
                    pc.addTrack(ScreenTrack())
                    if audio_dev is not None:
                        pc.addTrack(AudioTrack(vid))

                    @pc.on("icecandidate")
                    async def on_ice(c, v=vid):
                        if c:
                            await ws.send(json.dumps({
                                "type": "ice_candidate", "viewerId": v,
                                "candidate": {
                                    "candidate": c.to_sdp(),
                                    "sdpMid": c.sdpMid,
                                    "sdpMLineIndex": c.sdpMLineIndex,
                                },
                            }))

                    offer = await pc.createOffer()
                    await pc.setLocalDescription(offer)
                    await ws.send(json.dumps({
                        "type": "offer", "viewerId": vid,
                        "sdp": pc.localDescription.sdp,
                        "sdpType": pc.localDescription.type,
                    }))

                elif mt == "answer":
                    vid = msg.get("viewerId")
                    pc = pcs.get(vid)
                    if pc:
                        await pc.setRemoteDescription(RTCSessionDescription(
                            sdp=msg["sdp"], type=msg["sdpType"]
                        ))
                        print(f">> P2P connected to viewer {vid[:8]}")

                elif mt == "ice_candidate":
                    vid = msg.get("viewerId")
                    pc = pcs.get(vid)
                    if pc and msg.get("candidate"):
                        c = msg["candidate"]
                        sdp_str = c.get("candidate", "")
                        if sdp_str.startswith("candidate:"):
                            sdp_str = sdp_str[len("candidate:"):]
                        try:
                            cand = candidate_from_sdp(sdp_str)
                            cand.sdpMid = c.get("sdpMid")
                            cand.sdpMLineIndex = c.get("sdpMLineIndex")
                            await pc.addIceCandidate(cand)
                        except Exception as e:
                            print(f"[ice] {e}")

                elif mt == "settings":
                    if "maxDim" in msg:
                        MAX_DIM = int(msg["maxDim"])
                    if "fps" in msg:
                        FPS = max(1, min(60, int(msg["fps"])))
                    if "quality" in msg:
                        QUALITY = max(10, min(95, int(msg["quality"])))
                    print(f"  [settings] maxDim={MAX_DIM} fps={FPS}")

                elif mt == "input":
                    handle_input_sync(msg.get("event", {}))

                elif mt == "viewer_left":
                    vid = msg.get("viewerId")
                    pc = pcs.pop(vid, None)
                    if pc:
                        await pc.close()
                    print(f">> Viewer left ({msg.get('viewerCount', 0)} watching)")

                elif mt == "error":
                    print(f"Error: {msg.get('message')}")

        for pc in pcs.values():
            await pc.close()

# ─────────────────────────────────────────────────────────────────────────────
# JPEG fallback mode (used when aiortc unavailable)
# ─────────────────────────────────────────────────────────────────────────────
def run_jpeg(audio_dev):
    global MAX_DIM, FPS, QUALITY

    try:
        import websocket as ws_lib
    except ImportError:
        pip("websocket-client")
        import websocket as ws_lib

    ws_conn = None
    running = True
    viewer_count = 0
    capture_started = False
    screen_w = screen_h = img_w = img_h = 0
    audio_started = False

    def jpeg_capture():
        nonlocal img_w, img_h, screen_w, screen_h
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            screen_w, screen_h = monitor["width"], monitor["height"]
            last_hash = None
            while running and ws_conn and viewer_count > 0:
                t0 = time.time()
                try:
                    shot = sct.grab(monitor)
                    raw = bytes(shot.raw)
                    h = hashlib.md5(raw[::200]).digest()
                    if h == last_hash:
                        time.sleep(max(0, 1 / FPS - (time.time() - t0)))
                        continue
                    last_hash = h
                    img = Image.frombytes("RGB", (shot.width, shot.height), shot.rgb)
                    try:
                        mx, my = pyautogui.position()
                        mx = max(0, min(mx - monitor["left"], shot.width - 1))
                        my = max(0, min(my - monitor["top"], shot.height - 1))
                        draw = ImageDraw.Draw(img)
                        cs = 20
                        poly = [
                            (mx, my), (mx, my + cs),
                            (mx + cs * .35, my + cs * .7), (mx + cs * .55, my + cs * 1.05),
                            (mx + cs * .4, my + cs * 1.1), (mx + cs * .2, my + cs * .75),
                            (mx - cs * .05, my + cs * 1.05),
                        ]
                        draw.polygon([(int(x), int(y)) for x, y in poly], fill="white", outline="black")
                    except Exception:
                        pass
                    if MAX_DIM > 0 and img.width > MAX_DIM:
                        img = img.resize((MAX_DIM, int(img.height * MAX_DIM / img.width)), Image.BILINEAR)
                    img_w, img_h = img.width, img.height
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=QUALITY, subsampling=1, optimize=False)
                    if ws_conn:
                        ws_conn.send(b'\x01' + buf.getvalue(), opcode=ws_lib.ABNF.OPCODE_BINARY)
                except Exception as e:
                    if running:
                        print(f"[capture] {e}")
                time.sleep(max(0, 1 / FPS - (time.time() - t0)))

    def jpeg_audio():
        def callback(indata, frames, time_info, status):
            if not running or not ws_conn or viewer_count == 0:
                return
            try:
                pcm = (indata * 32767).astype(np.int16)
                ws_conn.send(b'\x02' + pcm.tobytes(), opcode=ws_lib.ABNF.OPCODE_BINARY)
            except Exception:
                pass
        try:
            with sd.InputStream(device=audio_dev, samplerate=48000, channels=2,
                                blocksize=4800, dtype="float32", callback=callback):
                while running and ws_conn:
                    time.sleep(0.1)
        except Exception as e:
            print(f"[audio] {e}")

    def on_message(ws, message):
        nonlocal viewer_count, capture_started, audio_started
        if not isinstance(message, str):
            return
        data = json.loads(message)
        mt = data.get("type")
        if mt == "room_created":
            print(f"\n{'='*50}\n  ROOM CODE:  {data['code']}\n{'='*50}")
            print(f"  Open: {SERVER.replace('wss://','https://').replace('ws://','http://')}/remote\n{'='*50}\n")
        elif mt == "viewer_joined":
            viewer_count = data.get("viewerCount", viewer_count + 1)
            print(f">> Viewer connected ({viewer_count} watching)")
            if not capture_started:
                capture_started = True
                threading.Thread(target=jpeg_capture, daemon=True).start()
            if not audio_started and audio_dev is not None:
                audio_started = True
                threading.Thread(target=jpeg_audio, daemon=True).start()
        elif mt == "viewer_left":
            viewer_count = data.get("viewerCount", max(0, viewer_count - 1))
            print(f">> Viewer left ({viewer_count} watching)")
        elif mt == "settings":
            global MAX_DIM, FPS, QUALITY
            if "maxDim" in data: MAX_DIM = int(data["maxDim"])
            if "fps"    in data: FPS     = max(1, min(60, int(data["fps"])))
            if "quality" in data: QUALITY = max(10, min(95, int(data["quality"])))
        elif mt == "input":
            handle_input_sync(data.get("event", {}))
        elif mt == "error":
            print(f"Error: {data.get('message')}")

    def on_error(ws, error): print(f"Connection error: {error}")
    def on_close(ws, *a):
        nonlocal running
        running = False
        print("Disconnected.")
    def on_open(ws):
        nonlocal ws_conn
        ws_conn = ws
        ws.send(json.dumps({"type": "host_create", "mode": "jpeg"}))
        print("Connected. Creating room...")

    try:
        import certifi
        sslopt = {"ca_certs": certifi.where()}
    except ImportError:
        sslopt = {"cert_reqs": ssl.CERT_NONE}

    app = ws_lib.WebSocketApp(
        SERVER.rstrip("/") + "/remote-ws",
        on_open=on_open, on_message=on_message,
        on_error=on_error, on_close=on_close,
    )
    app.run_forever(sslopt=sslopt)

# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("Veil Remote Desktop Agent")
    audio_dev = find_audio_device()
    if WEBRTC:
        import asyncio
        print("[WebRTC] Peer-to-peer — video/audio won't pass through the server")
        asyncio.run(run_webrtc(audio_dev))
    else:
        print("[JPEG] Relay mode — video passes through server (aiortc not available)")
        run_jpeg(audio_dev)

if __name__ == "__main__":
    main()
