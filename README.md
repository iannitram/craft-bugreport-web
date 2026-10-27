# craft-bugreport-web

A shared "Report a bug" button, form, consent screen and File Drop upload for the Craft web apps that run inside Nextcloud. Reports use the same zip layout and the same File Drop as the desktop launcher's bug reports, so the existing bug intake reads them unchanged.

**Stage:** see `PIPELINE.md`.

## Start here

- `SPEC.md`: what it must do, what it won't do, and what 1.0 means.
- `ROADMAP.md` and `docs/code-map.md`: the plan and how the code is laid out.
- `AGENTS.md`: rules for anyone, person or agent, changing the code.
- `CHANGELOG.md`: what changed and when.

## Using it from a host app

```js
import { installErrorBuffer, ReportButton } from 'craft-bugreport-web'

installErrorBuffer()          // as early as possible in main.js
// in a component:
// <ReportButton :config="{ app: 'Outliner', version, commit, ncVersion, dropBase, dropToken }"
//               :get-working-file="() => ({ name: 'outline.opml', type: 'text/x-opml', data })" />
```

The host app depends on a pinned tag: `"craft-bugreport-web": "github:iannitram/craft-bugreport-web#v1.0.0"`.
