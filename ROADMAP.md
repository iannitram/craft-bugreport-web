# Roadmap

1.0: see SPEC.md. Every row names its issue; issues follow the pipeline's RUBRIC (sizes, Qwen briefs on Easy ones).

## Stages

| Stage | What | Musts | Issues |
|---|---|---|---|
| 1. Core (pure JS) | filename, mask, manifest, error buffer, zip + fingerprint, upload with retries | M2, M3, M6, M7, M9, M10 | see the issue list (Easy, Qwen) |
| 2. Lockfile | commit package-lock.json; CI switches to `npm ci` | - | Easy |
| 3. UI | ReportButton + ReportForm (M1, M4, M5), ConsentScreen (M8) | M1, M4, M5, M8 | Medium |
| 4. Release | tag v1.0.0 after a manual send from one browser per OS into a test File Drop (M11); host apps pin the tag | M11 | Medium |

## Mac, PC and Linux (R04)

Browser code only, so the platforms are the desktop browsers on each OS. Platform-specific spots: path masking (POSIX and Windows paths), `navigator.userAgentData` is missing in Firefox and Safari (fall back to the user agent string), and Safari's file picker MIME types for screenshots. CI runs lint and tests on ubuntu, macos and windows.

## Open-source pieces

- **fflate** (MIT): zip in the browser; chosen over JSZip for size and a synchronous API.
- **Vue 3** (MIT): peer dependency, the host app's copy.
- **Vitest, @vue/test-utils, jsdom, ESLint with @nextcloud/eslint-config**: development only, same set as nc-outliner.

## First users

- nc-outliner (its SPEC Must for "Report a bug") and nc-projects (same); their mount issues are blocked by this repo's release issue.
