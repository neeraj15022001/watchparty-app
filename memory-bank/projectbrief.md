# Project Brief: WatchParty Pro

## Executive Summary
WatchParty Pro is an open-source, zero-degradation collaborative cinema and spatial voice platform. It enables groups of friends to watch streaming content (Netflix, YouTube, Prime Video), direct web video URLs (MP4, HLS, WebM), and local files together in perfect synchronization with decoupled WebRTC voice and video chat.

## Core Requirements & Goals
1. **Zero Video Re-encoding (Pristine Quality):**
   - Eliminate blurry, re-compressed 720p screen recordings typical of virtual-browser watch parties.
   - For OTT platforms: Use client-side state synchronization via a companion browser extension. Each participant streams directly from official CDNs with native 4K/HDR, Widevine DRM, and multi-channel audio untouched.
   - For local files: Provide native HTML5 video playback with HTTP 206 Partial Content (Range requests) so participants get true hardware decoding, buffering, and timeline scrubbing.
2. **Sub-200ms Precision Synchronization:**
   - Synchronize playback across physical devices with varying network latencies.
   - Use Cristian's algorithm (NTP-style) over WebSockets to calculate clock skew and round-trip time (RTT).
   - Apply dynamic drift steering (smooth 0.95x–1.05x playback rate adjustments) for imperceptible drift resolution, reserving hard seeks only for gaps > 1.2s.
3. **Decoupled Real-Time Communication:**
   - Run WebRTC voice and video chat on an independent mesh layer with acoustic echo cancellation (AEC) and noise suppression.
   - Ensure network fluctuations or camera bandwidth hiccups never interrupt or stutter movie playback.
4. **Smart Voice Ducking:**
   - Utilize the Web Audio API to monitor vocal energy across remote microphones in real time.
   - Automatically attenuate movie playback volume by 40% when friends speak, smoothly restoring normal volume when speech ceases.
5. **Zero External Server Dependencies:**
   - Build the backend signaling and range media streaming server in pure Python 3 using standard library modules (`asyncio`, `socket`). No heavy framework bloat or complex deployment prerequisites.

## Project Scope
- **Target Platforms:** Modern desktop browsers (Chrome, Brave, Edge, Firefox).
- **Core Deliverables:**
  - `server.py`: Pure Python async WebSocket signaling & HTTP 206 Range media server.
  - `public/`: Cinema web application (player, WebRTC mesh, smart ducking, chat).
  - `extension/`: Manifest V3 companion browser extension for OTT DOM hooking.
  - `docs/`: Project landing page, documentation, and live changelog deployed to GitHub Pages.
  - Governance: MIT License, Contributing Guide, Security Policy, Architecture Spec, and AI Disclosure.
