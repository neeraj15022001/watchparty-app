# Technical Context: WatchParty Pro

## Technologies & Stack

### Backend Server (`server.py`)
- **Runtime:** Python 3.8+ (Tested on Python 3.9.6 on macOS).
- **Core Standard Libraries:**
  - `asyncio`: Asynchronous networking and TCP socket server.
  - `socket`: Network addressing and low-level protocol handling.
  - `hashlib` & `base64`: RFC 6455 WebSocket handshake accept key generation.
  - `struct`: Binary WebSocket frame header packing and unpacking.
  - `mimetypes`: Automatic MIME type resolution for video, audio, CSS, JS, SVG.
  - `urllib.parse`: HTTP URL and query string parsing.
  - `shutil` & `os`: Media file linking, symlinking, and byte-range streaming.
- **Third-Party Dependencies:** **Zero.** (No `pip install` required).

### Frontend Application (`public/` & `docs/`)
- **Languages:** HTML5, Modern Vanilla JavaScript (ES6+ Modules), CSS3.
- **Browser APIs:**
  - `WebSocket`: Real-time duplex communication with signaling server.
  - `RTCPeerConnection`: WebRTC mesh audio and video conferencing.
  - `navigator.mediaDevices.getUserMedia`: Webcam and microphone hardware capture.
  - `AudioContext` & `AnalyserNode`: Real-time vocal energy analysis for smart audio ducking.
  - `HTMLMediaElement` (`<video>`): Hardware-accelerated native playback and timeline events.
  - `File API` & `XMLHttpRequest`: Streaming chunked local video file uploader.
- **Styling:** Custom CSS with CSS variables, flexbox, CSS grid, and responsive media queries.

### Companion Browser Extension (`extension/`)
- **Platform:** Chrome, Brave, Microsoft Edge, Mozilla Firefox.
- **Manifest Version:** Manifest V3.
- **Permissions:** `storage`, `activeTab`.
- **Target Hosts:** `*://*.netflix.com/*`, `*://*.youtube.com/*`, `*://*.primevideo.com/*`.
- **Injected Scripts:** Content script observing `<video>` DOM elements, creating a floating status HUD, and managing WebSocket synchronization.

### CI/CD & Hosting
- **CI/CD:** GitHub Actions (`.github/workflows/deploy-pages.yml`).
- **Hosting:** GitHub Pages for project landing page and documentation (`docs/`).

---

## Development Setup & Commands

### Running Locally
```bash
# Start signaling & media server
cd ~/Desktop/watchparty-app
python3 server.py --host 127.0.0.1 --port 8080

# Join a room
open "http://localhost:8080/?room=cinema-night"
```

### Loading Extension in Developer Mode
1. Open `chrome://extensions`.
2. Enable **Developer mode** toggle.
3. Click **Load unpacked** and select `~/Desktop/watchparty-app/extension`.

---

## Technical Constraints & Boundaries

- **macOS Sandbox Restrictions:**
  - Network binding requires network access permission.
  - File access is strictly restricted to connected folders (`/Users/neerajgupta/Desktop` and `/Users/neerajgupta/Downloads/credit-card-skills-main`).
  - Git version control operations **must** use `client:execute_mcp` with server `git`.
- **DRM Protection:**
  - Commercial OTT platforms (Netflix, Prime) use Widevine hardware DRM. Screen-capturing these elements causes black frames. Client-side extension state sync completely bypasses this limitation.
- **WebRTC Mesh Limits:**
  - P2P mesh scales well up to 4–6 participants. For larger rooms, an SFU (Selective Forwarding Unit) should be used.
