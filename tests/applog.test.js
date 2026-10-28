import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { currentErrorLines, installErrorBuffer } from '../src/core/errorBuffer.js'
import { buildReport } from '../src/core/report.js'

const dec = new TextDecoder()
const NO_ERRORS = 'No errors or warnings were recorded.'
const NOW = new Date('2026-10-26T21:00:00Z')
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'

let buffer = null

afterEach(() => {
	buffer?.uninstall()
	buffer = null
})

/**
 * Build a report the way ReportForm does: the buffer's lines are read when the report is made.
 *
 * @param {object} overrides fields to change
 * @return {Promise<{ zip: Uint8Array, appLog: string }>}
 */
async function makeReport(overrides = {}) {
	const report = await buildReport({
		config: { app: 'Outliner', version: '0.3.0', userName: 'CANARY_USER_31' },
		whatHappened: 'FORM_TEXT_31 happened',
		expected: '',
		screenshot: null,
		includeWorkingFile: false,
		getWorkingFile: () => null,
		errorLines: currentErrorLines(),
		now: NOW,
		userAgent: USER_AGENT,
		...overrides,
	})
	const entries = unzipSync(report.zip)
	return { zip: report.zip, appLog: dec.decode(entries['app.log']) }
}

describe('app.log from the installed error buffer', () => {
	it('contains the buffered error and warning lines with their timestamps', async () => {
		buffer = installErrorBuffer()
		console.error('E-one')
		console.warn('W-two')
		const { appLog } = await makeReport()
		const lines = appLog.split('\n')
		expect(lines).toHaveLength(2)
		expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z ERROR E-one$/)
		expect(lines[1]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z WARN W-two$/)
	})

	it('says so when no buffer is installed', async () => {
		const { appLog } = await makeReport()
		expect(appLog).toBe(NO_ERRORS)
	})

	it('says so when the installed buffer is empty', async () => {
		buffer = installErrorBuffer()
		const { appLog } = await makeReport()
		expect(appLog).toBe(NO_ERRORS)
	})

	it('does not put the form text into app.log', async () => {
		buffer = installErrorBuffer()
		console.error('E-one')
		const { appLog } = await makeReport()
		expect(appLog).not.toContain('FORM_TEXT_31')
	})

	it('masks file names, paths, the user name and URL queries before they enter app.log or the zip', async () => {
		buffer = installErrorBuffer()
		console.error('open CANARY_FILE_31.opml from /Outlines/CANARY_PATH_31/x.opml')
		console.warn('fetch https://h/x?CANARY_Q_31=1 for CANARY_USER_31')
		const { zip, appLog } = await makeReport()
		for (const canary of ['CANARY_FILE_31', 'CANARY_PATH_31', 'CANARY_USER_31', 'CANARY_Q_31']) {
			expect(appLog).not.toContain(canary)
			expect(dec.decode(zip)).not.toContain(canary)
		}
		expect(appLog).toContain('<file>')
		expect(appLog).toContain('<path>')
		expect(appLog).toContain('<url>')
	})

	it('masks e-mail addresses and tokens in message and stack text', async () => {
		buffer = installErrorBuffer()
		console.error('login failed for CANARY_MAIL_31@example.org with Authorization: Bearer CANARY_BEARER_31')
		console.warn('config', { api_key: 'CANARY_KEY_31', note: 'x' })
		console.error(new Error('boom CANARY_LONG_31abcdefghijklmnopqrstuvwxyz0123456789'))
		const { zip, appLog } = await makeReport()
		for (const canary of ['CANARY_MAIL_31', 'CANARY_BEARER_31', 'CANARY_KEY_31', 'CANARY_LONG_31']) {
			expect(appLog).not.toContain(canary)
			expect(dec.decode(zip)).not.toContain(canary)
		}
		expect(appLog).toContain('<email>')
		expect(appLog).toContain('<token>')
		expect(appLog).toMatch(/ERROR Error: boom/)
	})

	it('keeps only the last 200 lines and at most 64 KB in app.log', async () => {
		buffer = installErrorBuffer({ size: 500 })
		for (let i = 0; i < 250; i++) {
			console.error(`n=${i}`)
		}
		const { appLog } = await makeReport()
		const lines = appLog.split('\n')
		expect(lines).toHaveLength(200)
		expect(lines[199]).toMatch(/ n=249$/)
		expect(lines[0]).toMatch(/ n=50$/)

		console.error('x'.repeat(200000))
		const big = await makeReport()
		expect(new TextEncoder().encode(big.appLog).byteLength).toBeLessThanOrEqual(64 * 1024)
	})

	it('the buffer itself keeps its size limit', () => {
		buffer = installErrorBuffer({ size: 3 })
		for (let i = 0; i < 10; i++) {
			console.error(`e${i}`)
		}
		expect(currentErrorLines()).toHaveLength(3)
	})

	it('returns a copy, and [] after uninstall', () => {
		buffer = installErrorBuffer()
		console.error('E-copy')
		const copy = currentErrorLines()
		copy.length = 0
		expect(currentErrorLines()).toHaveLength(1)
		buffer.uninstall()
		buffer = null
		expect(currentErrorLines()).toEqual([])
	})
})
