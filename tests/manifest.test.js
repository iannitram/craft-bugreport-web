import { describe, expect, it } from 'vitest'
import { buildManifest } from '../src/core/manifest.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

const FILES = ['what-happened.txt', 'app.log', 'manifest.json']
const CONFIG = { app: 'Outliner', version: '0.3.0', commit: 'abc1234', ncVersion: '33.0.10' }
const NOW = new Date('2026-10-26T21:00:00Z')

const KEYS = [
	'kind',
	'app',
	'version',
	'commit',
	'os',
	'arch',
	'exit',
	'signature',
	'created',
	'files',
	'working_file_included',
	'screenshot_included',
	'names_masked',
	'sent_as_is',
	'nextcloud',
	'browser',
]

function input(userAgent, files = FILES) {
	return {
		config: CONFIG,
		files,
		workingFileIncluded: false,
		screenshotIncluded: false,
		sentAsIs: [],
		now: NOW,
		userAgent,
	}
}

describe('buildManifest', () => {
	it('describes Firefox on Linux', () => {
		const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'
		const result = buildManifest(deepFreeze(input(ua)))
		expect(result).toMatchObject({
			kind: 'manual',
			app: 'Outliner',
			version: '0.3.0',
			commit: 'abc1234',
			os: 'linux',
			arch: 'x86_64',
			exit: null,
			signature: null,
			created: '2026-10-26T21:00:00.000Z',
			files: ['what-happened.txt', 'app.log', 'manifest.json'],
			working_file_included: false,
			screenshot_included: false,
			names_masked: true,
			sent_as_is: [],
			nextcloud: '33.0.10',
			browser: 'Firefox 139',
		})
	})

	it('describes Edge on Windows', () => {
		const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
		const result = buildManifest(deepFreeze(input(ua)))
		expect(result.os).toBe('windows')
		expect(result.arch).toBe('x86_64')
		expect(result.browser).toBe('Edge 141')
	})

	it('describes Safari on Mac', () => {
		const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
		const result = buildManifest(deepFreeze(input(ua)))
		expect(result.os).toBe('macos')
		expect(result.browser).toBe('Safari 18')
	})

	it('has exactly the 16 keys in order and copies the files array', () => {
		const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'
		const files = [...FILES]
		const result = buildManifest({ ...input(ua), config: deepFreeze({ ...CONFIG }), files })
		expect(Object.keys(result)).toEqual(KEYS)
		files.push('screenshot.png')
		expect(result.files).toEqual(FILES)
	})
})
