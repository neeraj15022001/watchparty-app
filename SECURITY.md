# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

---

## Security Model & Threat Boundaries

WatchParty Pro is designed with privacy and security in mind:

1. **No Cloud Credential Storage:** The server and extension never collect, store, or transmit Netflix, YouTube, or Prime Video credentials or cookies. Each participant runs in their own authenticated session on their browser.
2. **Local Media Sandboxing:** The local path loader only resolves files within explicitly allowed directories. Absolute paths are validated to prevent directory traversal outside permissible filesystem bounds.
3. **WebRTC Security:** All audio and video conferencing between peers uses standard WebRTC DTLS/SRTP encryption.
4. **WebSocket Sanitization:** Chat messages and player state payloads are strictly validated before broadcasting to prevent XSS.

---

## Reporting a Vulnerability

If you discover a security vulnerability within WatchParty Pro, please do **NOT** open a public issue.

Instead, please send an email describing the vulnerability to the project maintainer:
- **Email:** `neeraj15022001@gmail.com`

Please include:
- A description of the issue and potential impact
- Step-by-step reproduction steps or a minimal proof-of-concept
- Any suggestions for mitigation

You will receive an acknowledgment within 48 hours, followed by updates on investigation and remediation.
