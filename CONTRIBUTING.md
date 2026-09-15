# Contributing to WatchParty Pro

Thank you for your interest in contributing to **WatchParty Pro**! We welcome contributions from developers, designers, and testers of all experience levels.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.

---

## Getting Started

### 1. Prerequisites
- Python 3.8 or higher (No third-party Python packages required; the server runs on standard library `asyncio` and `socket`).
- A modern web browser (Google Chrome, Brave, Mozilla Firefox, or Microsoft Edge).

### 2. Fork and Clone
```bash
git clone https://github.com/neeraj15022001/watchparty-app.git
cd watchparty-app
```

### 3. Running Locally
Start the server:
```bash
python3 server.py --host 127.0.0.1 --port 8080
```
Open your browser at:
`http://localhost:8080/?room=dev-test`

### 4. Loading the Browser Extension (for OTT testing)
1. Navigate to `chrome://extensions`.
2. Toggle on **Developer mode**.
3. Click **Load unpacked** and choose the `extension/` directory in this repository.

---

## Development Guidelines

### Repository Structure
- `server.py`: Pure Python asynchronous WebSocket signaling and HTTP 206 Partial Content (Range) media server.
- `public/`: Frontend cinema application (Vanilla ES6+, WebRTC mesh, Web Audio API ducking, CSS3).
- `extension/`: Manifest V3 browser extension for DOM hooking on OTT platforms.
- `docs/`: Project landing page, documentation, and live changelog deployed to GitHub Pages.

### Coding Standards
- **Zero Heavy Dependencies:** We strive to keep the core server free of heavy third-party framework bloat. Use standard library where possible.
- **Precision Playback:** Avoid introducing blocking synchronous calls into `server.py`'s event loop.
- **Web Standards:** Frontend code should use native browser APIs (WebRTC, Web Audio API, Fetch, Custom Events) rather than large bundled UI frameworks unless agreed upon in an RFC issue.

---

## AI-Assisted Contributions Policy

We embrace AI tools (such as Gemini, Claude, Copilot, ChatGPT) as powerful development accelerants. However, to maintain code reliability and architectural integrity:

1. **Human Oversight & Verification:** If you use an AI coding assistant, you are fully responsible for understanding and verifying every line of code submitted. Untested AI boilerplate will be rejected.
2. **Transparency:** Please mention in your pull request description if an AI tool was used to assist with the code, tests, or documentation.
3. **No Hallucinated Dependencies:** Ensure all referenced methods, APIs, and libraries actually exist and are covered by our zero-dependency policy.
4. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md) for more details.

---

## Submitting Pull Requests

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-cool-feature
   ```
2. Commit your changes with clear, semantic commit messages:
   ```bash
   git commit -m "feat(player): add keyboard shortcuts for seek and mute"
   ```
3. Push to your fork:
   ```bash
   git push origin feature/my-cool-feature
   ```
4. Open a Pull Request on GitHub against the `main` branch following our [PR Template](.github/pull_request_template.md).

---

## Reporting Issues

Found a bug or have an enhancement idea? Please check the existing issues first. If it hasn't been reported, open a new issue using our [Issue Templates](.github/ISSUE_TEMPLATE/).
