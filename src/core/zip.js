import { NotBuilt } from './notBuilt.js'

// Zip with the launcher layout and its SHA-256 fingerprint (M7). Uses fflate.

/**
 * @param {Array<{ name: string, data: Uint8Array }>} entries the files, in order
 * @return {Uint8Array} the zip bytes
 */
export function buildZip(entries) {
	throw new NotBuilt('buildZip', entries)
}

/**
 * @param {Uint8Array} bytes the zip
 * @return {Promise<string>} lowercase hex SHA-256 (WebCrypto)
 */
export async function fingerprint(bytes) {
	throw new NotBuilt('fingerprint', bytes)
}
