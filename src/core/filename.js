import { NotBuilt } from './notBuilt.js'

// Name in the File Drop (M9): <App>-web-<YYYYMMDDTHHMMSSZ>-<8 hex>.zip

/**
 * @param {string} app the host app's name
 * @param {Date} now the time
 * @param {string} randomHex 8 lowercase hex characters
 * @return {string}
 */
export function dropFileName(app, now, randomHex) {
	throw new NotBuilt('dropFileName', app, now, randomHex)
}
