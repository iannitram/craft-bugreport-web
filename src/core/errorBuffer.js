// Error buffer (M2): the last N console errors/warnings, window errors and unhandled rejections. See docs/code-map.md.

let installed = null

/**
 * Format one logged argument.
 *
 * @param {unknown} value the argument
 * @return {string}
 */
function formatArg(value) {
	if (typeof value === 'string') {
		return value
	}
	if (value instanceof Error) {
		const head = `${value.name}: ${value.message}`
		return value.stack ? `${head}\n${value.stack}` : head
	}
	try {
		const json = JSON.stringify(value)
		return json === undefined ? String(value) : json
	} catch {
		return String(value)
	}
}

/**
 * Wrap console.error / console.warn and listen for window 'error' and
 * 'unhandledrejection'. The originals are still called.
 *
 * @param {{ size?: number }} [options] how many lines to keep (default 200)
 * @return {{ lines: () => string[], uninstall: () => void }}
 */
export function installErrorBuffer({ size = 200 } = {}) {
	if (installed) {
		return installed
	}

	const target = globalThis.console
	const originalError = target.error
	const originalWarn = target.warn
	const buffer = []
	let active = true

	const add = (line) => {
		buffer.push(line)
		if (buffer.length > size) {
			buffer.splice(0, buffer.length - size)
		}
	}

	const onError = (event) => {
		const where = event.filename ? `${event.filename}:${event.lineno}` : 'unknown'
		add(formatLine('error', [`${event.message} at ${where}`], new Date()))
	}

	const onUnhandled = (event) => {
		add(formatLine('error', ['Unhandled rejection:', event.reason], new Date()))
	}

	target.error = (...args) => {
		add(formatLine('error', args, new Date()))
		originalError(...args)
	}
	target.warn = (...args) => {
		add(formatLine('warn', args, new Date()))
		originalWarn(...args)
	}
	window.addEventListener('error', onError)
	window.addEventListener('unhandledrejection', onUnhandled)

	const handle = {
		lines: () => buffer.slice(),
		uninstall: () => {
			if (!active) {
				return
			}
			active = false
			target.error = originalError
			target.warn = originalWarn
			window.removeEventListener('error', onError)
			window.removeEventListener('unhandledrejection', onUnhandled)
			if (installed === handle) {
				installed = null
			}
		},
	}

	installed = handle
	return handle
}

/**
 * A copy of the installed buffer's lines, oldest first; [] when no buffer is installed.
 *
 * @return {string[]}
 */
export function currentErrorLines() {
	return installed ? installed.lines() : []
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
	return `${date.toISOString()} ${level.toUpperCase()} ${args.map(formatArg).join(' ')}`
}
