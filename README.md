# WatchParty Pro - Collaborative Cinema & Voice Platform

A high-fidelity, zero-degradation watch party platform designed for watching movies and streaming media with friends in perfect synchronization.

---

## Architecture Highlights

1. **Native 4K / HDR Quality Preservation:**
   - **OTT Platforms (Netflix, YouTube, Prime Video):** Uses client-side state synchronization via a companion browser extension. Each participant streams directly from official CDNs with native resolution, HDR, and Widevine DRM active.
   - **Direct Video URLs (MP4 / HLS / DASH):** Synchronized native HTML5 `<video>` player with adaptive bitrate support.
   - **Local Video Files:** Direct in-browser local file loading via the HTML5 File API with state synchronization, preserving original multi-channel audio and native bitrates.
2. **Sub-200ms Precision Sync:**
   - Real-time Cristian's algorithm (NTP-style) over WebSockets calculating clock skew and round-trip time (RTT).
   - Dynamic drift steering: smooth playbackRate adjustments (0.95x–1.05x) for imperceptible alignment, plus hard seeking for large offsets.
3. **Decoupled Real-Time Communication:**
   - WebRTC peer-to-peer mesh for live microphone and webcam streaming.
   - **Smart Voice Ducking:** Built with the Web Audio API. Monitors incoming microphone speech energy and smoothly attenuates the movie playback volume by 40% (customizable) whenever a friend speaks.

---

## Project Structure

```
watchparty-app/
├── server.py              # Pure Python zero-dependency async WebSocket & HTTP server
├── public/                # Web Client Application
│   ├── index.html         # Dark-mode cinema theater interface
│   ├── style.css          # Modern theater styling & active speaker indicators
│   └── app.js             # Core sync engine, WebRTC mesh & Web Audio ducking
└── extension/             # Companion Browser Extension (Manifest V3)
    ├── manifest.json      # Extension configuration
    ├── content.js         # Video player hook for Netflix, YouTube, Prime Video
    ├── popup.html         # Quick room settings popup
    └── popup.js           # Extension state management
```

---

## Quickstart Guide

### 1. Launch the Server
Open your macOS Terminal and run:
```bash
cd ~/Desktop/watchparty-app
python3 server.py
```
By default, the server runs on `http://127.0.0.1:8080`. You can also specify custom host and port:
```bash
python3 server.py --host 0.0.0.0 --port 8080
```

### 2. Open the Web Application
Open your browser and navigate to:
```
http://localhost:8080?room=cinema-night
```
- Share the link with friends on your local network (or via tunnel like Cloudflare Tunnel / ngrok).
- Click **Copy Link** in the top bar to share the room invite.

### 3. Install the Companion Extension (for Netflix, YouTube, Prime)
1. Open Chrome, Edge, or Brave and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the folder:
   `~/Desktop/watchparty-app/extension`
4. Open Netflix or YouTube in a tab, and the floating WatchParty HUD will automatically hook into the player. Click the extension icon to set your Room ID to match your party.
