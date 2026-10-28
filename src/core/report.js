import { buildManifest } from './manifest.js'
import { maskText } from './mask.js'
import { buildZip, fingerprint } from './zip.js'

// Assemble a report (M3-M7): files, zip, fingerprint, manifest.

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024

const WORKING_FILE_EXTENSIONS = ['opml', 'odt', 'json', 'txt']
const SCREENSHOT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

const encoder = new TextEncoder()

/**
 * Turn the accepted data shapes into bytes.
 *
 * @param {unknown} value bytes, an ArrayBuffer, a Blob/File or a string
 * @return {Promise<Uint8Array>}
 */
async function toBytes(value) {
	if (value instanceof Uint8Array) {
		return value
	}
	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value)
	}
	if (ArrayBuffer.isView(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
	}
	if (typeof value === 'string') {
		return encoder.encode(value)
	}
	if (value && typeof value.arrayBuffer === 'function') {
		return new Uint8Array(await value.arrayBuffer())
	}
	throw new TypeError('file data must be bytes')
}

/**
 * Read the data of a screenshot or working file.
 *
 * @param {object} file `{ data }`, a Blob/File, or the bytes themselves
 * @return {Promise<Uint8Array>}
 */
async function dataOf(file) {
	if (file && typeof file === 'object' && 'data' in file) {
		return toBytes(file.data)
	}
	return toBytes(file)
}

/**
 * Pick the extension for a report entry from the file name, then the MIME type,
 * accepting only values on the entry's allowlist.
 *
 * @param {unknown} name the original file name
 * @param {unknown} type the MIME type
 * @param {string} fallback the extension when neither gives an allowed one
 * @param {string[]} allowed the extensions this entry may carry
 * @return {string}
 */
function extensionFrom(name, type, fallback, allowed) {
	if (typeof name === 'string') {
		const dot = name.lastIndexOf('.')
		if (dot > 0 && dot < name.length - 1) {
			const ext = name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
			if (ext && allowed.includes(ext)) {
				return ext === 'jpeg' ? 'jpg' : ext
			}
		}
	}

	if (typeof type === 'string') {
		const slash = type.indexOf('/')
		if (slash !== -1) {
			let subtype = type.slice(slash + 1).split(';')[0].split('+')[0].trim().toLowerCase()
			subtype = subtype.replace(/^x-/, '')
			if (subtype === 'jpeg') {
				subtype = 'jpg'
			}
			subtype = subtype.replace(/[^a-z0-9]/g, '')
			if (subtype && allowed.includes(subtype)) {
				return subtype
			}
		}
	}

	return fallback
}

/**
 * @param {object} input see docs/code-map.md
 * @return {Promise<{ files: Array<{ name: string, size: number, data: Uint8Array, sentAsIs: boolean }>, zip: Uint8Array, fingerprint: string, manifest: object }>}
 */
export async function buildReport(input) {
	const {
		config = {},
		whatHappened,
		expected,
		screenshot,
		includeWorkingFile,
		getWorkingFile,
		errorLines = [],
	} = input

	const now = input.now instanceof Date ? input.now : new Date()
	const userAgent = input.userAgent ?? globalThis.navigator?.userAgent ?? ''
	const userName = config.userName

	const maskedWhatHappened = maskText(whatHappened, { userName })
	const maskedExpected = maskText(expected, { userName })
	const whatHappenedText = `What happened:\n${maskedWhatHappened}\n\nWhat I expected:\n${maskedExpected}\n`
	const whatHappenedData = encoder.encode(whatHappenedText)

	const lines = typeof errorLines === 'function' ? errorLines() : errorLines
	const appLog = (Array.isArray(lines) ? lines : [])
		.map((line) => maskText(line, { userName }))
		.join('\n')
	const appLogData = encoder.encode(appLog)

	let screenshotEntry = null
	if (screenshot !== null && screenshot !== undefined) {
		if (typeof screenshot.size === 'number' && screenshot.size > MAX_SCREENSHOT_BYTES) {
			throw new RangeError('screenshot is larger than 8 MB')
		}
		const data = await dataOf(screenshot)
		if (data.byteLength > MAX_SCREENSHOT_BYTES) {
			throw new RangeError('screenshot is larger than 8 MB')
		}
		const ext = extensionFrom(screenshot.name, screenshot.type, 'png', SCREENSHOT_EXTENSIONS)
		screenshotEntry = { name: `screenshot.${ext}`, data }
	}

	let workingEntry = null
	if (includeWorkingFile && typeof getWorkingFile === 'function') {
		const workingFile = await getWorkingFile()
		if (workingFile !== null && workingFile !== undefined) {
			const data = await dataOf(workingFile)
			const ext = extensionFrom(workingFile.name, workingFile.type, 'bin', WORKING_FILE_EXTENSIONS)
			workingEntry = { name: `working-file.${ext}`, data }
		}
	}

	const sentAsIs = []
	if (screenshotEntry) {
		sentAsIs.push(screenshotEntry.name)
	}
	if (workingEntry) {
		sentAsIs.push(workingEntry.name)
	}

	const names = ['what-happened.txt', 'app.log', 'manifest.json', ...sentAsIs]

	const manifest = buildManifest({
		config,
		files: names,
		workingFileIncluded: Boolean(workingEntry),
		screenshotIncluded: Boolean(screenshotEntry),
		sentAsIs,
		now,
		userAgent,
	})
	const manifestData = encoder.encode(JSON.stringify(manifest))

	const entries = [
		{ name: 'what-happened.txt', data: whatHappenedData },
		{ name: 'app.log', data: appLogData },
		{ name: 'manifest.json', data: manifestData },
	]
	if (screenshotEntry) {
		entries.push(screenshotEntry)
	}
	if (workingEntry) {
		entries.push(workingEntry)
	}

	const files = entries.map(({ name, data }) => ({
		name,
		size: data.byteLength,
		data,
		sentAsIs: sentAsIs.includes(name),
	}))

	const zip = buildZip(entries)
	const digest = await fingerprint(zip)

	return { files, zip, fingerprint: digest, manifest }
}
