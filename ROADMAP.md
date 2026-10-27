# Roadmap

1.0: see SPEC.md. Every row names its issue; issues follow the pipeline's RUBRIC (sizes, Qwen briefs on Easy ones).

## Stages

| Stage | What | Musts | Issues |
|---|---|---|---|
| 1. Core (pure JS) | filename, mask, manifest, error buffer, zip + fingerprint, upload with retries | M2, M3, M6, M7, M9, M10 | #2 filename, #3 mask, #4 manifest, #5 error buffer, #6 zip, #8 upload, #11 secrets guard (Easy, Qwen); #7 buildReport (Medium) |
| 2. Lockfile | commit package-lock.json; CI switches to `npm ci` | - | #1 (Easy) |
| 3. UI | ReportButton + ReportForm (M1, M4, M5), ConsentScreen (M8) | M1, M4, M5, M8 | #9 form, #10 consent screen, #13 standalone mount for non-Vue hosts (Medium) |
| 4. Release | tag v1.0.0 after a manual send from one browser per OS into a test File Drop (M11); host apps pin the tag | M11 | #12 (Medium) |

## Mac, PC and Linux (R04)

Browser code only, so the platforms are the desktop browsers on each OS. Platform-specific spots: path masking (POSIX and Windows paths), `navigator.userAgentData` is missing in Firefox and Safari (fall back to the user agent string), and Safari's file picker MIME types for screenshots. CI runs lint and tests on ubuntu, macos and windows.

## Open-source pieces

- **fflate** (MIT): zip in the browser; chosen over JSZip for size and a synchronous API.
- **Vue 3** (MIT): peer dependency, the host app's copy.
- **Vitest, @vue/test-utils, jsdom, ESLint with @nextcloud/eslint-config**: development only, same set as nc-outliner.

## First users

- nc-outliner (SPEC M14; issues nc-outliner#124, #125) and nc-projects (SPEC M21; nc-projects#39, #40); both are blocked by #12. NeoCraft (iannitram/neo: its Nextcloud browser editor and the Electron desktop app) uses the standalone mount (#13); the owner: "This will all apply to Neo as well". This repo is private, so the host apps' CI cannot install it by tag until it is made public or given a read-only CI credential (the owner's call, noted on #12).
