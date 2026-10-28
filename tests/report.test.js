import { describe, expect, it, vi } from 'vitest'
import { buildReport, MAX_SCREENSHOT_BYTES } from '../src/core/report.js'
import { fingerprint } from '../src/core/zip.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

const CONFIG = {
	app: 'Outliner',
	version: '0.3.0',
	commit: 'abc1234',
	ncVersion: '33.0.10',
	userName: 'alex',
}
const NOW = new Date('2026-10-26T21:00:00Z')
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'
const ERROR_LINES = [
	'2026-10-26T20:59:58.000Z ERROR failed at /home/alex/a.opml',
	'2026-10-26T20:59:59.000Z WARN alex saw a warning',
]

function input(overrides = {}) {
	return {
		config: CONFIG,
		whatHappened: 'Alex opened /home/alex/a.opml and it failed',
		expected: 'I expected alex to see the outline',
		screenshot: null,
		includeWorkingFile: false,
		getWorkingFile: vi.fn(() => null),
		errorLines: ERROR_LINES,
		now: NOW,
		userAgent: USER_AGENT,
		...overrides,
	}
}

function dataOf(report, name) {
	return report.files.find((file) => file.name === name)?.data
}

describe('buildReport', () => {
	it('writes the what-happened.txt text exactly, masking both fields', async () => {
		const report = await buildReport(input())
		const expected = 'What happened:\n'
			+ '<user> opened ~/a.opml and it failed\n'
			+ '\n'
			+ 'What I expected:\n'
			+ 'I expected <user> to see the outline\n'
		expect(dec.decode(dataOf(report, 'what-happened.txt'))).toBe(expected)
	})

	it('leaves the expected section empty when none was given', async () => {
		const report = await buildReport(input({ expected: undefined }))
		const expected = 'What happened:\n'
			+ '<user> opened ~/a.opml and it failed\n'
			+ '\n'
			+ 'What I expected:\n\n'
		expect(dec.decode(dataOf(report, 'what-happened.txt'))).toBe(expected)
	})

	it('writes the masked error buffer lines to app.log', async () => {
		const report = await buildReport(input())
		const expected = '2026-10-26T20:59:58.000Z ERROR failed at ~/a.opml\n'
			+ '2026-10-26T20:59:59.000Z WARN <user> saw a warning'
		expect(dec.decode(dataOf(report, 'app.log'))).toBe(expected)
	})

	it('assembles the fixed files, manifest and fingerprint', async () => {
		const report = await buildReport(input({
			screenshot: { name: 'shot.png', type: 'image/png', data: enc.encode('PNGDATA') },
			includeWorkingFile: true,
			getWorkingFile: vi.fn(() => ({
				name: 'outline.opml',
				type: 'text/x-opml',
				data: enc.encode('<opml/>'),
			})),
		}))

		expect(report.files.map((file) => file.name)).toEqual([
			'what-happened.txt',
			'app.log',
			'manifest.json',
			'screenshot.png',
			'working-file.opml',
		])
		for (const file of report.files) {
			expect(file.size).toBe(file.data.byteLength)
		}
		expect(report.files.map((file) => [file.name, file.sentAsIs])).toEqual([
			['what-happened.txt', false],
			['app.log', false],
			['manifest.json', false],
			['screenshot.png', true],
			['working-file.opml', true],
		])

		expect(report.manifest).toEqual({
			kind: 'manual',
			app: 'Outliner',
			version: '0.3.0',
			commit: 'abc1234',
			os: 'linux',
			arch: 'x86_64',
			exit: null,
			signature: null,
			created: '2026-10-26T21:00:00.000Z',
			files: [
				'what-happened.txt',
				'app.log',
				'manifest.json',
				'screenshot.png',
				'working-file.opml',
			],
			working_file_included: true,
			screenshot_included: true,
			names_masked: true,
			sent_as_is: ['screenshot.png', 'working-file.opml'],
			nextcloud: '33.0.10',
			browser: 'Firefox 139',
		})

		expect(report.fingerprint)
			.toBe('4363b5308e0eb32ab483ca3e8d3a0cc61cb27d8c60de97536487e3f90c75797e')
		expect(await fingerprint(report.zip)).toBe(report.fingerprint)
	})

	it('accepts a screenshot of exactly 8 MB', async () => {
		const report = await buildReport(input({
			screenshot: { name: 'big.png', type: 'image/png', data: new Uint8Array(MAX_SCREENSHOT_BYTES) },
		}))
		expect(report.files.map((file) => file.name)).toContain('screenshot.png')
		expect(dataOf(report, 'screenshot.png').byteLength).toBe(MAX_SCREENSHOT_BYTES)
		expect(report.manifest.screenshot_included).toBe(true)
		expect(report.manifest.sent_as_is).toEqual(['screenshot.png'])
	})

	it('refuses a screenshot of 8 MB + 1 byte with a RangeError', async () => {
		let error
		try {
			await buildReport(input({
				screenshot: {
					name: 'big.png',
					type: 'image/png',
					data: new Uint8Array(MAX_SCREENSHOT_BYTES + 1),
				},
			}))
		} catch (caught) {
			error = caught
		}
		expect(error).toBeInstanceOf(RangeError)
		expect(error.message).toBe('screenshot is larger than 8 MB')
	})

	it('never calls getWorkingFile when the box is unticked', async () => {
		const getWorkingFile = vi.fn(() => ({
			name: 'outline.opml',
			type: 'text/x-opml',
			data: enc.encode('<opml/>'),
		}))
		const report = await buildReport(input({ includeWorkingFile: false, getWorkingFile }))

		expect(getWorkingFile).not.toHaveBeenCalled()
		expect(report.files.map((file) => file.name)).not.toContain('working-file.opml')
		expect(report.manifest.working_file_included).toBe(false)
		expect(report.manifest.sent_as_is).toEqual([])
	})

	it('includes working-file.<ext> when the box is ticked', async () => {
		const getWorkingFile = vi.fn(() => ({
			name: 'outline.opml',
			type: 'text/x-opml',
			data: enc.encode('<opml/>'),
		}))
		const report = await buildReport(input({ includeWorkingFile: true, getWorkingFile }))

		expect(getWorkingFile).toHaveBeenCalledTimes(1)
		expect(report.files.map((file) => file.name)).toContain('working-file.opml')
		expect(dec.decode(dataOf(report, 'working-file.opml'))).toBe('<opml/>')
		expect(report.manifest.working_file_included).toBe(true)
		expect(report.manifest.sent_as_is).toEqual(['working-file.opml'])
	})
})
