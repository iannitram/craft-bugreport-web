# Spec

**1.0 means:** a Craft web app inside Nextcloud can mount one "Report a bug" button that collects what happened, the app's recent errors, an optional screenshot and an optional copy of the open document, shows the user every file, and only after they press Send puts a launcher-format report zip into the owner's File Drop, where the existing bug intake reads it unchanged.

**Approval:** 2026-10-26, the owner, in the Project Manager session's question tool: "Yes, a 1.0 Must (Recommended)", "Launcher set, browser version (Recommended)", "Same File Drop (Recommended)", "One shared module repo (Recommended)". The request, in the owner's words: "New feature request for both apps - bug logging button with the same pathway as the launcher bug submission pathway".

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
- No crash detection beyond the error buffer (the host page has no process to watch).
- No account login or Nextcloud credentials: the File Drop is upload-only and public on the tailnet.
- No reading or listing of the File Drop, and no follow-up on a sent report.
- No server-side component in this repo (a host app that wants one builds it itself).
- No screenshots taken by the module itself (browsers do not allow it without extra permissions); the user picks an image.

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
