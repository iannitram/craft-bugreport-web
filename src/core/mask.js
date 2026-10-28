// Masking (M6): user name to <user>, home-style paths to ~.

const WORD_CHAR = '[\\p{L}\\p{N}_]'

/**
 * Escape the characters that have a meaning in a regular expression.
 *
 * @param {string} value the literal text to escape
 * @return {string}
 */
function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Masks home-style paths and the signed-in user's name.
 *
 * Rules run in this order:
 * 1. Windows home paths (`X:\Users\<name>` or `X:/Users/<name>`, any case) become `~`.
 *    This runs first so a drive letter is removed with the path, not left behind.
 * 2. `/home/<name>` becomes `~`.
 * 3. `/Users/<name>` becomes `~`.
 * 4. The user name becomes `<user>` as a case-insensitive whole word.
 *
 * @param {string} text the text to mask
 * @param {{ userName?: string }} options the signed-in user's name
 * @return {string}
 */
export function maskText(text, { userName } = {}) {
	if (text === null || text === undefined) {
		return ''
	}
	let masked = String(text)
	masked = masked.replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s]+/gi, '~')
	masked = masked.replace(/\/home\/[^/\s]*/g, '~')
	masked = masked.replace(/\/Users\/[^/\s]+/g, '~')
	if (typeof userName === 'string' && userName.length > 0) {
		const name = new RegExp(
			`(?<!${WORD_CHAR})${escapeRegExp(userName)}(?!${WORD_CHAR})`,
			'giu',
		)
		masked = masked.replace(name, '<user>')
	}
	return masked
}
