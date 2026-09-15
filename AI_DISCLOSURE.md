# AI Disclosure & Transparency Statement

## Overview

**WatchParty Pro** was conceptualized, designed, and developed using a collaborative **Human-in-the-Loop AI Engineering Workflow** powered by Google DeepMind's Gemini Spark agent alongside project maintainer Neeraj Gupta.

This disclosure provides full transparency regarding the development methodology, verification processes, and governance policies for open-source AI-assisted software.

---

## Development Methodology

1. **Architecture & Design:**
   - The zero-re-encoding philosophy, NTP Cristian's clock synchronization, and Web Audio API smart voice ducking algorithms were architected through structured product requirements documents (PRD) and technical review.
2. **Implementation:**
   - Code components across `server.py` (pure Python async WebSocket and HTTP Range streaming), `public/` (WebRTC mesh and canvas/DOM cinema interface), and `extension/` (Manifest V3 DOM observer) were authored with AI pair-programming.
3. **Quality Assurance & Verification:**
   - Every module was executed, verified, and debugged on real macOS hardware with multi-window and incognito session testing.
   - All network payloads and HTTP 206 Partial Content byte ranges were validated using direct curl and network inspection tools.

---

## Guidelines for AI-Assisted Community Contributions

We enthusiastically welcome contributions created with AI coding assistants (Gemini, Copilot, Claude, Cursor, ChatGPT, etc.). To maintain high engineering standards:

- **Full Comprehension:** Contributors must understand the logic, edge cases, and performance implications of any AI-suggested code.
- **Verification Requirement:** AI-generated pull requests must be tested locally. Do not submit untried or untested AI output.
- **Dependency Discipline:** Contributions must strictly respect our zero-dependency policy for the server engine (`server.py` relies exclusively on the Python standard library).
- **Attribution:** We encourage tagging PRs with `[AI-assisted]` or mentioning the tools used in your PR description.
