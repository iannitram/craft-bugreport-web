// Name in the File Drop (M9): <App>-web-<YYYYMMDDTHHMMSSZ>-<8 hex>.zip

/**
 * @param {string} app the host app's name
 * @param {Date} now the time
 * @param {string} randomHex 8 lowercase hex characters
 * @return {string}
 */
export function dropFileName(app, now, randomHex) {
	if (!/^[0-9a-f]{8}$/.test(randomHex)) {
		throw new TypeError('randomHex must be 8 lowercase hex characters')
	}
	const name = app.replace(/[^A-Za-z0-9]/g, '')
	if (name === '') {
		throw new TypeError('app is empty')
	}
	const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
	return `${name}-web-${stamp}-${randomHex}.zip`
}
