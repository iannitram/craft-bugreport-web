# Rules for agents in this repo

Everything you need to work here is in this repo. The full pipeline and rules live in the pipeline repo (private: `PIPELINE.md`, `RULES.md`, `RUBRIC.md`, `roles/`); this is the short copy.

1. **Find the stage** in `PIPELINE.md`. The spec is `SPEC.md`, the plan `ROADMAP.md`, the code map `docs/code-map.md`.
2. **Work from an issue.** Take one that is not `in-progress` and not blocked; add `in-progress` before you start. Its body is your brief; an Easy issue has a "Qwen brief" section with the expected results and the code map snippet.
3. **Your own platform's issues first.** Mac, Windows and Linux all matter: say which you built on.
4. **Check that it builds**, then open the PR. CI and the Project Manager's review chain do the rest.
5. **Label the PR** `by:<machine>` and `model:<model>`, and write `Closes #N`. Move the module's status in `docs/code-map.md` from stub to present in the same PR.
6. **A failed job** gets a comment on the issue saying what happened, and the issue moves up one size (Easy -> Medium -> Hard).
7. **Use the project's words** from `GLOSSARY.md` and the decisions in `docs/adr/`.
8. **No private details** in code, commits or PR text: no names, e-mail addresses, home paths or machine names. Commit as the no-reply identity.

## This project

- **Nothing is sent without the user's Send press.** No automatic upload, ever; the consent screen lists every file first. This is the launcher's rule and the intake depends on it.
- **The zip layout and manifest fields match the desktop launcher's** (docs/code-map.md, Report format). Changing either breaks the bug intake; it needs the owner's word.
- **No File Drop address or token in this repo, in tests or in fixtures.** A browser host passes `relayUrl` (a URL on its own origin) and optional `headers`, never a drop address or token; `dropBase`/`dropToken` are for non-browser hosts only. Tests use `https://drop.example.test` and a fake token.
- **Browser only.** No `node:` imports in `src/`; the module runs in the host app's page. Tests run in jsdom.
- **Small and dependency-light.** Vue is a peer dependency; the only runtime dependency is the zip library (fflate).
