import { NotBuilt } from './notBuilt.js'

// manifest.json (M3), same fields as the desktop launcher plus nextcloud and browser.

/**
 * @param {object} input see docs/code-map.md
 * @return {object} the manifest object (JSON-serialisable)
 */
export function buildManifest(input) {
	throw new NotBuilt('buildManifest', input)
}
