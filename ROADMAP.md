# Roadmap

Updated: 2026-11-11

features:
- report-core: Build the report in the page: error buffer, masking, manifest, zip, fingerprint and buildReport (M2, M3, M6, M7)
- upload: Send the report: File Drop name, retries, relay mode and the no-secrets check (M9, M10)
- form: The Report a bug button and form (M1, M4, M5)
- consent: The consent screen: every file shown, nothing sent until Send (M8)
- standalone: The standalone mount and bundle for hosts without Vue
- build-ci: The lockfile and the checks on Mac, PC and Linux
- release: The v1.0.0 release after a real send from each OS (M11)
- recorder: Flight recorder, wholly After 1.0 (1.1): the masked 60-second timeline, page hooks, timeline.json and the v1.1.0 release (M12-M14)
- timeline-consent: Wholly After 1.0 (1.1): the consent screen shows the timeline and lets the user strike events (M15)
- error-notice: Wholly After 1.0 (1.1): the "Something went wrong. Report it?" notice (M16)

1.0: see SPEC.md. Every row names its issue; issues follow the pipeline's RUBRIC (sizes, Qwen briefs on Easy ones).

## Stages

| Stage | What | Musts | Issues |
|---|---|---|---|
| 1. Core (pure JS) | filename, mask, manifest, error buffer, zip + fingerprint, upload with retries | M2, M3, M6, M7, M9, M10 | #2 filename, #3 mask, #4 manifest, #5 error buffer, #6 zip, #8 upload, #11 secrets guard (Easy, Qwen); #7 buildReport (Medium) |
| 2. Lockfile | commit package-lock.json; CI switches to `npm ci` | - | #1 (Easy) |
| 3. UI | ReportButton + ReportForm (M1, M4, M5), ConsentScreen (M8) | M1, M4, M5, M8 | #9 form, #10 consent screen, #13 standalone mount for non-Vue hosts (Medium) |
| 4. Release | tag v1.0.0 after a manual send from one browser per OS into a test File Drop (M11); host apps pin the tag | M11 | #12 (Medium) |
| 5. Flight recorder (1.1) | timeline ring buffer, event formatting and masking, page hooks, `timeline.json` in the report, strike events on the consent screen, the "Something went wrong" notice, release v1.1.0 | M12-M16 | #33 timeline, #34 format and mask, #35 timeline.json (Easy, Qwen); #36 page hooks, #37 strike events, #38 notice, #39 release v1.1.0 (Medium); all after #12 |

## Mac, PC and Linux (R04)

Browser code only, so the platforms are the desktop browsers on each OS. Platform-specific spots: path masking (POSIX and Windows paths), `navigator.userAgentData` is missing in Firefox and Safari (fall back to the user agent string), and Safari's file picker MIME types for screenshots. CI runs lint and tests on ubuntu, macos and windows.

## Open-source pieces

- **fflate** (MIT): zip in the browser; chosen over JSZip for size and a synchronous API.
- **Vue 3** (MIT): peer dependency, the host app's copy.
- **Vitest, @vue/test-utils, jsdom, ESLint with @nextcloud/eslint-config**: development only, same set as nc-outliner.

## First users

- nc-outliner (SPEC M14; issues nc-outliner#124, #125) and nc-projects (SPEC M21; nc-projects#39, #40); both are blocked by #12. NeoCraft (iannitram/neo: its Nextcloud browser editor and the Electron desktop app) uses the standalone mount (#13); the owner: "This will all apply to Neo as well". This repo is private, so the host apps' CI cannot install it by tag until it is made public or given a read-only CI credential (the owner's call, noted on #12).
