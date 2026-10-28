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
// <ReportButton :config="{ app: 'Outliner', version, commit, ncVersion, relayUrl, headers }"
//               :get-working-file="() => ({ name: 'outline.opml', type: 'text/x-opml', data })" />
```

app.log holds the page's recent errors and warnings recorded by `installErrorBuffer()`, so call it first, before the app starts.

The host app depends on a pinned tag: `"craft-bugreport-web": "github:iannitram/craft-bugreport-web#v1.0.0"`.

### Sending from a page: relay mode

A browser cannot PUT to the File Drop directly: the drop sends no CORS headers, and a drop token in the page would reach anyone who opens the app. So a page sends through **its own server**. The page passes `relayUrl`, a URL on the page's own origin, and the library POSTs the finished zip there as multipart/form-data, in one file field named `report`. The file name is `<App>-web-<UTC>-<8 hex>.zip`, the same as in the drop. The host's server forwards the zip to the drop.

- `relayUrl`: a relative path such as `/apps/outliner/api/bug-report`, or an `https` URL on the page's own origin (`http` only for `localhost` and `127.0.0.1`). Any other origin is refused, and redirects are not followed.
- `headers`: an optional object sent with the POST exactly as given. Nextcloud's CSRF check needs `requesttoken`.
- A config that sets `relayUrl` **and** `dropBase` or `dropToken` is refused with an error ("Use relayUrl or dropBase/dropToken, not both; a page must use relayUrl."). Nothing is sent.

**Nextcloud pattern.** Build the URL with the host's router and send the request token:

```js
import { generateUrl } from '@nextcloud/router'   // or OC.generateUrl(...) on older pages

const config = {
  app: 'Outliner',
  version,
  commit,
  ncVersion: OC.config?.version,
  relayUrl: generateUrl('/apps/outliner/api/bug-report'),
  headers: { requesttoken: OC.requestToken },
}
```

The server route is the host's job, on the host's side, and never in the page. A short PHP sketch (not tested here; check it against your app's Nextcloud version):

```php
// Host app, server side: POST /apps/outliner/api/bug-report (requesttoken is checked by Nextcloud).
// The drop address and token come from this app's own config, never from the page.
public function bugReport(): DataResponse {
	$file = $this->request->getUploadedFile('report');
	if ($file === null || $file['error'] !== UPLOAD_ERR_OK) {
		return new DataResponse([], Http::STATUS_BAD_REQUEST);
	}
	if ($file['size'] > 9 * 1024 * 1024) {
		return new DataResponse([], Http::STATUS_REQUEST_ENTITY_TOO_LARGE);
	}
	if (!preg_match('/^Outliner-web-\d{8}T\d{6}Z-[0-9a-f]{8}\.zip$/', $file['name'])) {
		return new DataResponse([], Http::STATUS_BAD_REQUEST);
	}
	$base = $this->config->getAppValue('outliner', 'bug_drop_base');
	$token = $this->config->getAppValue('outliner', 'bug_drop_token');
	$url = rtrim($base, '/') . '/public.php/dav/files/' . rawurlencode($token) . '/' . $file['name'];
	$response = $this->clientService->newClient()->put($url, [
		'body' => fopen($file['tmp_name'], 'rb'),
		'headers' => ['Content-Type' => 'application/zip'],
	]);
	// Forward a generic answer only; never the drop's body or headers.
	return new DataResponse([], $response->getStatusCode() === 201 ? Http::STATUS_CREATED : Http::STATUS_BAD_GATEWAY);
}
```

The browser sees only the status: 401 and 403 mean "sign in", 413 and 429 have their own messages, and 5xx is "try again later". The server must keep the drop's own response text out of its reply.

**Direct to the drop: non-browser hosts only.** `dropBase` and `dropToken` (with no `relayUrl`) make the library PUT straight to the File Drop. That is for a server, a command-line tool or an Electron main process that can keep the token secret. **Never use it in a page.** A page must use `relayUrl`.

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
    config: { app: 'Outliner', version, commit, ncVersion, relayUrl, headers },
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
    config: { app: 'Outliner', version, commit, ncVersion, relayUrl, headers },
    getWorkingFile: () => null,
  })
</script>
```

`relayUrl` and `headers` come from the page (the host's route and its request token), as above. A page never gets a drop address or token; if a host has one, it lives on the host's server. Never commit any of these values.
