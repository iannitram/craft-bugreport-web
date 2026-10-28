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

### Hosts without Vue

For a page or an editor that does not use Vue (NeoCraft's browser editor and Electron renderer, a plain-PHP app), use the standalone build. Vue is inside it, so the page needs nothing else. `npm run build` writes three files to `dist/`; copy them next to the page:

- `craft-bugreport-web.standalone.js`: an ES module.
- `craft-bugreport-web.standalone.iife.js`: a classic script that sets the global `CraftBugreport`.
- `craft-bugreport-web.standalone.css`: the styles. The JS does not inject them; link this file.

Either way the API is the same: `mountReportButton(el, { config, getWorkingFile })` returns `{ unmount() }`, which removes the button and leaves `el` empty. `installErrorBuffer()` is exported from both files too.

With a module script (serve the page over http or https; browsers block module scripts from `file://`):

```html
<link rel="stylesheet" href="craft-bugreport-web.standalone.css">
<div id="report-bug"></div>
<script type="module">
  import { installErrorBuffer, mountReportButton } from './craft-bugreport-web.standalone.js'

  installErrorBuffer()
  const handle = mountReportButton(document.getElementById('report-bug'), {
    config: { app: 'Outliner', version, commit, ncVersion, dropBase, dropToken },
    getWorkingFile: () => null, // or () => ({ name, type, data })
  })
  // handle.unmount() removes it again
</script>
```

With a classic script (works from `file://` too):

```html
<link rel="stylesheet" href="craft-bugreport-web.standalone.css">
<div id="report-bug"></div>
<script src="craft-bugreport-web.standalone.iife.js"></script>
<script>
  CraftBugreport.installErrorBuffer()
  const handle = CraftBugreport.mountReportButton(document.getElementById('report-bug'), {
    config: { app: 'Outliner', version, commit, ncVersion, dropBase, dropToken },
    getWorkingFile: () => null,
  })
</script>
```

`dropBase` and `dropToken` come from the server, as above; never commit them.
