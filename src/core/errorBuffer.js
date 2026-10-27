import { NotBuilt } from './notBuilt.js'

// Error buffer (M2): the last N console errors/warnings, window errors and unhandled rejections. See docs/code-map.md.

/**
 * Wrap console.error / console.warn and listen for window 'error' and
 * 'unhandledrejection'. The originals are still called.
 *
 * @param {{ size?: number }} [options] how many lines to keep (default 200)
 * @return {{ lines: () => string[], uninstall: () => void }}
 */
export function installErrorBuffer(options = {}) {
	throw new NotBuilt('installErrorBuffer', options)
}

/**
 * One buffer line: "<ISO time> <LEVEL> <message>".
 *
 * @param {'error'|'warn'} level the level
 * @param {Array<unknown>} args what was logged
 * @param {Date} date when
 * @return {string}
 */
export function formatLine(level, args, date) {
	throw new NotBuilt('formatLine', level, args, date)
}
