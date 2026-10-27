import { NotBuilt } from './notBuilt.js'

// Masking (M6): user name to <user>, home-style paths to ~.

/**
 * @param {string} text the text to mask
 * @param {{ userName?: string }} options the signed-in user's name
 * @return {string}
 */
export function maskText(text, { userName } = {}) {
	throw new NotBuilt('maskText', text, userName)
}
