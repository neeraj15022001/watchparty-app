# Product Context: WatchParty Pro

## Why WatchParty Pro Exists

Watching movies and shows together online is a staple of digital connection. However, existing solutions force users into an unacceptable compromise:

1. **The Virtual Browser Dilemma (watchparty.me, Hyperbeam, Discord screen share):**
   - Renders a remote browser on a cloud server, captures the screen, re-encodes the video in real-time, and streams it over WebRTC.
   - **Flaws:** Significant video compression artifacts, macroblocking in dark scenes, washed-out colors, capped framerates (often 30fps), 720p resolution caps, high server costs, and frequent DRM blackouts.
2. **The Extension Limitations (Teleparty / Netflix Party):**
   - Teleparty preserves native quality by only syncing play/pause state across users' personal accounts, but:
   - **Flaws:** It only supports major commercial subscription services. It cannot stream personal/local video files, custom web URLs, or provide integrated WebRTC voice/video chat or audio ducking within the same cinema layout.

WatchParty Pro exists to merge the **pristine quality of state synchronization** with the **versatility of multi-source media and built-in spatial voice chat**.

---

## Problems Solved

- **Video Degradation Eliminated:** Video streams are never re-compressed on a server. Every user decodes pristine streams natively with hardware acceleration.
- **Local File Isolation Fixed:** Local video files loaded by the host are served via standard HTTP 206 Partial Content (Range requests) over loopback or local network, making them seekable and playable across multiple tabs and remote friends without quality loss.
- **Microphone & Movie Audio Clash:** When watching movies while voice-chatting on Discord or Zoom, dialogue is frequently drowned out. WatchParty Pro's integrated Web Audio API ducking engine automatically dips movie volume whenever someone speaks.
- **Audio Echo Loops:** Built-in Acoustic Echo Cancellation (AEC) and decoupled media tracks prevent speaker output from feeding back into microphones.

---

## How It Should Work (User Journey)

1. **Creating a Room:**
   - The host runs `python3 server.py` and opens `http://localhost:8080/?room=movie-night`.
   - The host clicks **"🔗 Copy Link"** and sends the invite URL to friends.
2. **Selecting Content:**
   - **Direct URL:** Paste an MP4, WebM, or HLS link.
   - **Local File:** Drag and drop a file or paste its local Mac path (e.g. `~/Desktop/movie.mp4`). The server links it instantly and streams it via HTTP Range requests.
   - **OTT Platform (Netflix, YouTube, Prime):** Users open the streaming service in their browser with the companion extension enabled. The extension syncs playback state across all party members.
3. **Watching & Communicating:**
   - Video plays in synchronized 1080p/4K.
   - Friends' webcams and microphones connect automatically via WebRTC mesh.
   - When anyone speaks, the movie volume gently attenuates by 40% and restores automatically.
