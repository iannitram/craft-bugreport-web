// Standalone entry for hosts without Vue (NeoCraft's browser editor and Electron renderer).
// Built to dist/craft-bugreport-web.standalone.js (ESM) and .iife.js (global CraftBugreport) with Vue bundled in.
// The components' scoped styles are part of the components, so importing them puts their CSS into the
// bundle's CSS file (craft-bugreport-web.standalone.css), which the host links with a <link> tag.

import { createApp } from 'vue'
import ReportButton from './components/ReportButton.vue'

export { installErrorBuffer } from './core/errorBuffer.js'

/**
 * Mount the "Report a bug" button, form and consent screen into an element.
 *
 * @param {Element} el the element to mount into; unmount() leaves it empty
 * @param {object} options the host's settings
 * @param {object} options.config app, version, commit, ncVersion, dropBase, dropToken
 * @param {() => ({ name: string, type: string, data: Uint8Array } | null)} [options.getWorkingFile] returns the file the user may attach, or null
 * @return {{ unmount: () => void }}
 */
export function mountReportButton(el, { config, getWorkingFile } = {}) {
	const app = createApp(ReportButton, { config, getWorkingFile })
	app.mount(el)
	return {
		unmount() {
			app.unmount()
		},
	}
}
