// Standalone entry for hosts without Vue (NeoCraft's browser editor and Electron renderer).
// Built to dist/craft-bugreport-web.standalone.js (ESM) and .iife.js (global CraftBugreport) with Vue bundled in.
// The components' scoped styles are part of the components, so importing them puts their CSS into the
// bundle's CSS file (craft-bugreport-web.standalone.css), which the host links with a <link> tag.

import { createApp } from 'vue'
import ReportButton from './components/ReportButton.vue'
import { relayProblem } from './core/relay.js'

export { installErrorBuffer } from './core/errorBuffer.js'

/**
 * Mount the "Report a bug" button, form and consent screen into an element.
 *
 * @param {Element} el the element to mount into; unmount() leaves it empty
 * @param {object} options the host's settings
 * @param {object} options.config app, version, commit, ncVersion, relayUrl, headers (relay mode, the page's usual mode), or dropBase, dropToken (non-browser hosts only; never in a page)
 * @param {() => ({ name: string, type: string, data: Uint8Array } | null)} [options.getWorkingFile] returns the file the user may attach, or null
 * @return {{ unmount: () => void }} throws when config sets both relayUrl and dropBase/dropToken, or a relayUrl that is not on this page's origin
 */
export function mountReportButton(el, { config = {}, getWorkingFile } = {}) {
	const problem = relayProblem(config)
	if (problem) {
		throw new Error(problem)
	}
	const app = createApp(ReportButton, { config, getWorkingFile })
	app.mount(el)
	return {
		unmount() {
			app.unmount()
		},
	}
}
