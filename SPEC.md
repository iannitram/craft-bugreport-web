# Spec

**1.0 means:** a Craft web app inside Nextcloud can mount one "Report a bug" button that collects what happened, the app's recent errors, an optional screenshot and an optional copy of the open document, shows the user every file, and only after they press Send puts a launcher-format report zip into the owner's File Drop, where the existing bug intake reads it unchanged.

**Approval:** 2026-10-26, the maintainer. Request: a bug logging button for both apps, using the same pathway as the launcher bug submission. Decisions: a 1.0 Must; launcher set, browser version; same File Drop; one shared module repo.

A changed Must or Won't sets this back to "not yet" until the owner approves again.

## Musts

| # | Must | Done looks like | Check |
|---|---|---|---|
| M1 | WHEN the host app mounts `ReportButton`, THE MODULE SHALL show a "Report a bug" button that opens the form | The button opens a form with "What happened?" (required) and "What did you expect?" | Component test: click opens the form; Send stays disabled until "What happened?" has text |
| M2 | WHEN `installErrorBuffer()` has run, THE MODULE SHALL keep the last 200 console errors and warnings, window `error` events and unhandled promise rejections, with ISO time and level, without stopping them reaching the console | The report's `app.log` holds those lines, newest last | Unit test with fake console calls and dispatched events; original console still called |
| M3 | THE MODULE SHALL write `manifest.json` with the launcher's fields: `kind` "manual", `app`, `version`, `commit`, `os`, `arch`, `exit` null, `signature` null, `created`, `files[]`, `working_file_included`, `screenshot_included`, `names_masked`, `sent_as_is[]`, plus `nextcloud` and `browser` | A manifest built from fixed inputs equals the expected JSON | Unit test with fixed clock and user agent |
| M4 | WHEN the user picks an image, THE MODULE SHALL attach it as `screenshot.<ext>` if it is at most 8 MB, and refuse a larger one with a message | An 8 MB image is attached; 8 MB + 1 byte is refused | Unit test on the size rule; component test on the message |
| M5 | WHEN the user ticks "Include the document I was working on" (unticked every time, never remembered), THE MODULE SHALL add the host app's `getWorkingFile()` result as `working-file.<ext>` and list it in `sent_as_is` | Ticking adds the file; reopening the form shows the box unticked again | Component test |
| M6 | THE MODULE SHALL mask the signed-in user's name and home-style paths in `what-happened.txt` and `app.log` the way the launcher does (user name to `<user>`, `/home/<name>` and `C:\Users\<name>` to `~`), and record `names_masked: true`; the screenshot and working file are sent as is | Masked text contains no user name; `sent_as_is` lists the screenshot and working file when present | Unit test with the expected masked strings |
| M7 | THE MODULE SHALL build the zip with the launcher's layout (`what-happened.txt`, `app.log`, `manifest.json`, `screenshot.<ext>`, `working-file.<ext>`) and fingerprint it with SHA-256 | Unzipping gives exactly those files; the fingerprint matches the bytes | Unit test unzips with the same library and hashes with WebCrypto |
| M8 | BEFORE sending, THE MODULE SHALL show the consent screen: every file with its size and a "Show me" view, the working file and screenshot marked "sent as is, not scrubbed", the words "Not sent yet", and Send, Keep and Delete | Nothing is uploaded until Send; Delete discards the report; Keep keeps it for this page session | Component test with a mocked fetch that must not be called before Send |
| M9 | WHEN Send is pressed, THE MODULE SHALL refuse a zip whose fingerprint changed since it was shown, else PUT it to `<dropBase>/public.php/dav/files/<dropToken>/<App>-web-<UTC>-<8 hex>.zip` with `Content-Type: application/zip`, treat 201 as sent, and retry 3 times with a doubling wait on 409, 423, 5xx or a network error | A 201 shows "Sent"; a 409 then 201 sends after one retry; a 403 fails at once with a message | Unit tests with a mocked fetch and fake timers |
| M10 | THE MODULE SHALL take `dropBase` and `dropToken` only from the host app's config and refuse to send (with a message) when either is missing | No address or token appears anywhere in this repo | Unit test; a repo grep in CI for the owner's host name finds nothing |
| M11 | THE MODULE SHALL work in current desktop Firefox, Chrome/Edge and Safari on Mac, Windows and Linux | The tests pass in jsdom on all three CI runners; a manual send works from one browser per OS | CI matrix; the release issue's manual check |

## Won'ts

- No automatic sending, ever; no "send without asking" setting.
- No crash detection beyond the error buffer and, from 1.1, the timeline (the host page has no process to watch).
- No account login or Nextcloud credentials: the File Drop is upload-only and reachable only by the host app's configured address.
- No reading or listing of the File Drop, and no follow-up on a sent report.
- No server-side component in this repo (a host app that wants one builds it itself).
- No screenshots taken by the module itself (browsers do not allow it without extra permissions); the user picks an image.

## 1.1: flight recorder

**1.1 means:** a report also carries a short, masked timeline of what the user did just before the bug (pages, buttons, failed requests, errors, the host app's own marks), the user can strike any line of it before Send, and an uncaught error offers "Something went wrong. Report it?" without ever sending on its own.

**Approval:** 2026-11-01, the owner, chosen from three bold proposals (flight recorder; one-panel composer; "point at it" capture). Ship order: v1.0.0 first (#12), then 1.1. The composer and capture ideas are not approved and are not in 1.1.

Why: the first real Linux sends (#12) carried an empty or near-empty `app.log`. Console errors alone rarely say how the user got there.

| # | Must | Done looks like | Check |
|---|---|---|---|
| M12 | WHEN `installErrorBuffer()` has run (unless called with `{ timeline: false }`), THE MODULE SHALL keep the events of the last 60 seconds, at most 100: route changes (`pushState`, `replaceState`, `popstate`, `hashchange`), clicks on buttons, links and button-like roles, failed requests (`fetch` and `XMLHttpRequest`, status 400 or more or a network error), window errors and unhandled rejections, and the host's `markEvent(name)` calls; originals still run and their results are unchanged | A click, a route change and a failed fetch inside the window appear in order; an event older than 60 s is gone; the wrapped `fetch` returns the same response | Unit tests with fake timers, jsdom events and a mocked `fetch` |
| M13 | THE MODULE SHALL record no typed text, input values, request or response bodies, headers, query strings or hashes; a click inside an input, textarea, select, contenteditable or `[data-bugreport-private]` element is recorded as label `<private>`; labels are cut to 40 characters and masked like `app.log`; a request path keeps at most 6 segments, the user name becomes `<user>`, a segment with a dot becomes `<file>`, a segment of 24+ characters becomes `<id>` | The masked event strings contain none of the test's secret words | Unit test with the expected events |
| M14 | THE MODULE SHALL add `timeline.json` (`window_seconds`, `events[]`, `host`) to the report when it holds an event or host diagnostics, take `host` from the host's optional `getDiagnostics()` (at most 16 KB as JSON, else `{ "truncated": true }`; a throw gives `{ "error": "getDiagnostics failed" }`), mask every string in `host` and the free-text event fields (`message`, `label`, `name`) like `app.log` (paths are already masked by the M13 path rule), and record `timeline_included` in the manifest | A report built with fixed events has the expected `timeline.json` and manifest | Unit test |
| M15 | THE consent screen SHALL list the timeline's events in "Show me", let the user strike any event, and rebuild the zip and fingerprint before Send; a struck event is not in the sent zip | Striking an event and pressing Send uploads a zip without it | Component test with a mocked fetch |
| M16 | WHEN a window error or unhandled rejection happens and no report dialog is open, THE MODULE SHALL show a dismissible "Something went wrong. Report it?" notice (at most once per 5 minutes; Dismiss silences it for the page session; the host can turn it off with `nudge: false`); Report opens the form with "What happened?" empty and the error named above it; nothing is sent without Send | Two errors 1 minute apart show one notice; Report opens the form; no fetch happens | Component test with fake timers |

1.1 Won'ts: no recording of keystrokes, input values, bodies, headers or query strings; no timeline before `installErrorBuffer()` runs; the timeline never leaves the page except inside a report the user sends.

## Problem

Bugs in the web apps are only reported when someone remembers to write them down somewhere, and the desktop launcher's report pathway does not reach them.

## Solution

The same "Report a bug" flow as the launcher, inside each web app, landing in the same File Drop so the morning bug intake turns real bugs into issues in the right repo.

## Implementation decisions

- Plain JS core (error buffer, mask, manifest, zip, filename, consent model, upload) plus three Vue 3 components; Vue is a peer dependency so the host's copy is used.
- Zip with fflate (MIT, small, synchronous `zipSync` in the browser, no Node APIs); SHA-256 with WebCrypto `crypto.subtle.digest`.
- The host passes `{ app, version, commit, ncVersion, dropBase, dropToken, userName }` and `getWorkingFile() -> { name, type, data } | null`.
- Consumed by tag: `github:iannitram/craft-bugreport-web#v<version>`.

## Testing decisions

Vitest in jsdom; fetch, the clock and timers are faked; no test touches a real network address. Component tests use `@vue/test-utils`.
