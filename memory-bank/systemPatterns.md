# System Patterns: WatchParty Pro

## System Architecture

WatchParty Pro separates the high-bandwidth video playback pipeline from low-latency real-time communications:

```
+---------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                  |
|                                                                                 |
|   +--------------------------+    +-----------------------------------------+   |
|   |    Local Cinema App      |    |       Companion Browser Extension       |   |
|   |                          |    |                                         |   |
|   |  - WebRTC Video/Audio    |    |  - Hooks Player DOM (Netflix, Prime)    |   |
|   |  - Audio Ducking Engine  |    |  - Intercepts play/pause/seek events    |   |
|   |  - HTTP Range Player     |    |  - NTP Clock Synchronization            |   |
|   +------------+-------------+    +--------------------+--------------------+   |
+----------------|---------------------------------------|------------------------+
                 |                                       |
                 | Media / WebRTC Tracks                 | JSON Sync Packets
                 v                                       v
+--------------------------------+      +-----------------------------------------+
|     WebRTC Media Layer         |      |     Signaling & Range Server (Python)   |
|  - Peer-to-Peer Mesh           |      |  - WebSocket Room State Machine         |
|  - Echo Cancellation (AEC)     |      |  - Cristian's Algorithm (<15ms routing) |
|  - Decoupled from Video Sync   |      |  - HTTP 206 Partial Content Streaming   |
+--------------------------------+      +-----------------------------------------+
```

---

## Key Design Patterns & Technical Decisions

### 1. Zero-Degradation Media Pipeline
- **Pattern:** Direct CDN Delivery + Out-of-Band State Synchronization.
- **Implementation:**
  - Content scripts hook the DOM `<video>` on OTT platforms.
  - Broadcasts lightweight state payloads: `action`, `current_time`, `is_playing`, `playback_rate`, `server_time`.
  - Clients execute programmatic updates locally while setting an `isProgrammatic` flag to prevent echo loops.

### 2. Clock Synchronization (Cristian's Algorithm)
- **Pattern:** Request-Response NTP Clock Offset Estimation.
- **Formula:**
  $$\text{RTT} = T_{\text{client\_recv}} - T_{\text{client\_send}}$$
  $$\text{Clock Offset} = (T_{\text{server\_recv}} + \frac{\text{RTT}}{2}) - T_{\text{client\_recv}}$$
  $$\text{Target Server Time} = \text{Local Time} + \text{Clock Offset}$$
- **Benefit:** Allows accurate calculation of where the video *should* be right now even if the sync packet spent 80ms in transit over Wi-Fi.

### 3. Gradual Drift Steering Algorithm
- **Pattern:** Continuous Pitch-Preserving Speed Adjustment.
- **Thresholds:**
  - **$\Delta \le 150\text{ms}$:** In-sync deadband; zero intervention.
  - **$150\text{ms} < \Delta \le 1,200\text{ms}$:** Soft nudge. Dynamically adjust `playbackRate` to $1.04\times$ (if behind) or $0.96\times$ (if ahead) for 800ms, then restore baseline rate.
  - **$\Delta > 1,200\text{ms}$:** Hard seek. Sets `video.currentTime = expectedTime`.

### 4. HTTP 206 Partial Content Range Streaming
- **Pattern:** Streamed Byte-Range Slicing.
- **Implementation:**
  - Server parses `Range: bytes=start-end`.
  - Returns `206 Partial Content`, `Content-Range: bytes start-end/total`, `Accept-Ranges: bytes`.
  - Transmits data in 64KB chunks to keep memory usage minimal.
  - Enables instant scrubbing across 4K/HDR files on disk.

### 5. Web Audio API Voice Ducking Engine
- **Pattern:** Audio Node Signal Monitoring & Smooth Gain/Volume Lerping.
- **Graph:**
  $$\text{Remote MediaStream} \longrightarrow \text{MediaStreamAudioSourceNode} \longrightarrow \text{AnalyserNode (FFT 256)}$$
- **Control Logic:**
  - Fast Fourier Transform (FFT) calculates real-time voice amplitude.
  - If amplitude $> 25$: Ducking activated. `mainVideo.volume` attenuates by 40% smoothly over 150ms.
  - Debounced timeout: Volume restores to base level 600ms after speech drops below threshold.

---

## Critical Implementation Paths

- **WebSocket Handshake:** RFC 6455 upgrade handled manually in `server.py` via `Sec-WebSocket-Key` + GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11` + SHA-1 + base64 encoding.
- **Frame Parser:** Unmasks incoming client frames using XOR mask key and decodes payload lengths (7-bit, 16-bit, 64-bit).
- **WebRTC Signaling Route:** Server routes `webrtc_signal` packets (SDP offer, answer, ICE candidates) directly between `sender_id` and `target_id`.
