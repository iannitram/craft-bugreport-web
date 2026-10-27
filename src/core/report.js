import { NotBuilt } from './notBuilt.js'

// Assemble a report (M3-M7): files, zip, fingerprint, manifest.

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024

/**
 * @param {object} input see docs/code-map.md
 * @return {Promise<{ files: Array<{ name: string, size: number, data: Uint8Array, sentAsIs: boolean }>, zip: Uint8Array, fingerprint: string, manifest: object }>}
 */
export async function buildReport(input) {
	throw new NotBuilt('buildReport', input)
}
