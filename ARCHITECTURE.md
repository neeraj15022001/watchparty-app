# WatchParty Pro - Architectural Specification

## 1. Executive Summary

WatchParty Pro is an open-source, zero-re-encoding collaborative cinema platform. Unlike traditional screen-sharing or virtual-browser platforms (e.g. Rabbit, watchparty.me) that re-compress video into 720p WebRTC video streams, WatchParty Pro adopts a **Decoupled Architecture**:
- **Video Delivery:** Native high-bitrate streaming via official CDNs (OTT platforms) or HTTP 206 Range requests (local files).
- **Playback Control:** Lightweight JSON timestamp synchronization over WebSockets.
- **Human Communication:** Isolated WebRTC mesh for microphone and camera streams with Web Audio API smart voice ducking.

---

## 2. Core Subsystems

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

### 2.1. OTT DOM Interception (Extension)
On protected platforms (Netflix, YouTube, Prime Video), a Manifest V3 content script hooks into the active HTML5 `<video>` element or the player's internal API (such as Netflix's Cadmium player).
- **Event Listeners:** `play`, `pause`, `seeking`, `seeked`, `ratechange`.
- **Loop Prevention:** An internal `isProgrammatic` semaphore flag suppresses outbound events when applying an incoming sync action.

### 2.2. Clock Synchronization (Cristian's Algorithm)
Because users have varying physical machine clocks and network latencies, all playback decisions are calculated relative to a unified room timeline:

1. Client sends `sync_clock` with timestamp $T_0$.
2. Server receives at $T_{\text{server}}$ and returns $T_0$ and $T_{\text{server}}$.
3. Client receives response at $T_1$.
4. $\text{RTT} = T_1 - T_0$.
5. $\text{Clock Offset} = (T_{\text{server}} + \frac{\text{RTT}}{2}) - T_1$.
6. $\text{Server Time} = \text{Local Time} + \text{Clock Offset}$.

### 2.3. Dynamic Drift Correction Engine
When an incoming playback update is received:
$$\Delta = |t_{\text{current}} - t_{\text{expected}}|$$
Where:
$$t_{\text{expected}} = t_{\text{sync}} + (t_{\text{now}} - t_{\text{event}}) \times \text{playbackRate}$$

- **Case 1 ($\Delta \le 150\text{ms}$):** Considered perfectly synchronized; no intervention.
- **Case 2 ($150\text{ms} < \Delta \le 1,200\text{ms}$):** Soft speed adjustment. The client temporarily adjusts `playbackRate` to $1.04\times$ (if behind) or $0.96\times$ (if ahead) for 800ms.
- **Case 3 ($\Delta > 1,200\text{ms}$):** Hard seek. The player directly sets `video.currentTime = t_expected`.

### 2.4. HTTP 206 Partial Content Streaming
Local video files (`.mp4`, `.webm`, `.mkv`) are served with HTTP 206 Range requests:
- Handles incoming `Range: bytes=start-end` headers.
- Streams 64KB chunks on demand.
- Allows immediate scrubbing across 4K files without loading the entire movie into memory.

### 2.5. Web Audio API Smart Voice Ducking
Incoming remote WebRTC audio streams pass through an `AudioContext`:
1. Remote peer audio is fed to an `AnalyserNode` with an FFT size of 256.
2. The root mean square (RMS) energy is sampled at 60fps.
3. If energy exceeds vocal threshold ($> 25$), the main `<video>` volume smoothly attenuates by $40\%$ over 150ms.
4. Normal volume is restored 600ms after speech ceases.
