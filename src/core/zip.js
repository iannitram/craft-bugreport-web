import { zipSync } from 'fflate'

// Zip with the launcher layout and its SHA-256 fingerprint (M7). Uses fflate.

const mtime = new Date(1980, 0, 1)

/**
 * @param {Array<{ name: string, data: Uint8Array }>} entries the files, in order
 * @return {Uint8Array} the zip bytes
 */
export function buildZip(entries) {
	const files = Object.create(null)
	for (const { name, data } of entries) {
		if (name.includes('/') || name.includes('\\') || name.includes('..')) {
			throw new TypeError(`bad entry name: ${name}`)
		}
		if (Object.hasOwn(files, name)) {
			throw new TypeError(`duplicate entry: ${name}`)
		}
		files[name] = data
	}
	return zipSync(files, { level: 6, mtime })
}

/**
 * @param {Uint8Array} bytes the zip
 * @return {Promise<string>} lowercase hex SHA-256 (WebCrypto)
 */
export async function fingerprint(bytes) {
	const digest = await crypto.subtle.digest('SHA-256', bytes)
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
