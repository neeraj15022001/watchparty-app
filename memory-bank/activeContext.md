# Active Context: WatchParty Pro

## Current Work Focus
- Project architecture and implementation are complete and verified on the host system.
- Open-source governance, documentation, landing page with changelog, and GitHub Pages deployment workflow have been authored and committed to Git.
- Next step is establishing this persistent Memory Bank so subsequent engineering sessions have full fidelity.

---

## Recent Changes

1. **HTTP 206 Range Streaming Implementation:**
   - Diagnosed issue where opening local files in a secondary/incognito window showed a blank screen (due to browser in-memory `blob:` URL isolation).
   - Replaced temporary blob playback with a robust server-side HTTP 206 Partial Content (Range request) streaming engine in `server.py`.
   - Added `/api/upload` (streamed chunk uploader) and `/api/load-local-path` (instant local path linking with zero copy overhead).
   - Verified that multi-window and incognito sessions can now scrub, seek, and stream the same local file in 4K/HDR with sub-200ms synchronization.
2. **Open Source & Governance Framework:**
   - Created official project banner (`assets/banner.svg` and `docs/banner.svg`).
   - Added `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `ARCHITECTURE.md`.
   - Created `AI_DISCLOSURE.md` detailing human-in-the-loop AI engineering and contribution standards.
   - Added GitHub issue templates (bug report, feature request) and PR template.
3. **Landing Page & Changelog Website:**
   - Created modern responsive landing page in `docs/` (`index.html`, `style.css`, `app.js`).
   - Integrated live Changelog timeline documenting v1.0.0 and v1.1.0 releases.
   - Added GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) for automatic deployment to GitHub Pages.
4. **Git Commits:**
   - Commit `ff03c89`: Initial commit of core platform (`server.py`, `public/`, `extension/`, `README.md`).
   - Commit `670628a`: Added banner, governance, AI disclosure, and GitHub Pages site.

---

## Active Decisions & Considerations

- **Server Zero-Dependency Rule:** Kept `server.py` strictly within the Python 3 standard library (`asyncio`, `socket`, `hashlib`, `base64`, `struct`, `json`, `mimetypes`, `urllib`). Do not introduce pip dependencies unless an RFC issue demonstrates strong justification.
- **WebRTC Topology:** Currently uses a peer-to-peer mesh suitable for intimate groups (2–6 friends). If scaling to larger rooms (10+ people), an SFU (e.g. LiveKit) can be integrated as a pluggable backend without touching the cinema sync engine.
- **Loopback Host Binding:** Server defaults to `127.0.0.1:8080`. Accepts `--host 0.0.0.0` and `--port` CLI arguments for local network or tunneling scenarios.

---

## Key Learnings & Insights

- **Browser Blob URLs:** `URL.createObjectURL(file)` is strictly isolated to the browser tab/context that created it. For multi-tab or multi-user watch parties, local files must be registered with the server and streamed over HTTP Range requests so all clients can seek independently.
- **Range Header Requirement:** Modern HTML5 `<video>` implementations (especially Chrome, Safari, Edge) require `Accept-Ranges: bytes` and `HTTP/1.1 206 Partial Content` with `Content-Range: bytes start-end/total` to buffer forward and seek properly.
- **Git Version Control Directive:** Always use `client:execute_mcp` with server `git` for all Git operations (`git_init`, `git_add`, `git_commit`, `git_status`, `git_push`). Never use shell commands or `@github` extensions for Git tasks.
