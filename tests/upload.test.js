import { beforeAll, describe, expect, it, vi } from 'vitest'
import { sendReport } from '../src/core/upload.js'
import { buildZip, fingerprint } from '../src/core/zip.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

const URL_OK = 'https://drop.example.test/public.php/dav/files/FAKETOKEN/Outliner-web-20261026T210509Z-0a1b2c3d.zip'

let report
let baseOptions

beforeAll(async () => {
	const zip = buildZip([{ name: 'what-happened.txt', data: new TextEncoder().encode('a') }])
	report = deepFreeze({ files: [], zip, fingerprint: await fingerprint(zip), manifest: {} })
	baseOptions = {
		dropBase: 'https://drop.example.test',
		dropToken: 'FAKETOKEN',
		app: 'Outliner',
		now: new Date('2026-10-26T21:05:09Z'),
		randomHex: '0a1b2c3d',
	}
})

function setup(...statuses) {
	const fetchImpl = vi.fn()
	for (const status of statuses) {
		fetchImpl.mockResolvedValueOnce({ status })
	}
	const sleep = vi.fn(async () => {})
	return { fetchImpl, sleep }
}

describe('sendReport', () => {
	it('PUTs the zip once and reports success on 201', async () => {
		const { fetchImpl, sleep } = setup(201)
		const result = await sendReport(report, deepFreeze({ ...baseOptions, fetchImpl, sleep }))
		expect(fetchImpl).toHaveBeenCalledTimes(1)
		expect(fetchImpl).toHaveBeenCalledWith(URL_OK, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/zip' },
			body: report.zip,
		})
		expect(result).toEqual({ ok: true, status: 201, message: 'Sent. Thank you.' })
	})

	it('retries after 409 and succeeds on the second try', async () => {
		const { fetchImpl, sleep } = setup(409, 201)
		const result = await sendReport(report, { ...baseOptions, fetchImpl, sleep })
		expect(fetchImpl).toHaveBeenCalledTimes(2)
		expect(sleep).toHaveBeenCalledTimes(1)
		expect(sleep).toHaveBeenCalledWith(1000)
		expect(result.ok).toBe(true)
	})

	it('gives up after three 503s, waiting 1000 then 2000', async () => {
		const { fetchImpl, sleep } = setup(503, 503, 503)
		const result = await sendReport(report, { ...baseOptions, fetchImpl, sleep })
		expect(fetchImpl).toHaveBeenCalledTimes(3)
		expect(sleep.mock.calls).toEqual([[1000], [2000]])
		expect(result).toEqual({
			ok: false,
			status: 503,
			message: 'Could not send the report (503). It is kept; try again later.',
		})
	})

	it('does not retry a 403', async () => {
		const { fetchImpl, sleep } = setup(403)
		const result = await sendReport(report, { ...baseOptions, fetchImpl, sleep })
		expect(fetchImpl).toHaveBeenCalledTimes(1)
		expect(result).toEqual({ ok: false, status: 403, message: 'The drop refused the report (403).' })
	})

	it('refuses without calling fetch when dropToken is missing', async () => {
		const { fetchImpl, sleep } = setup()
		const result = await sendReport(report, { ...baseOptions, dropToken: '', fetchImpl, sleep })
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, message: 'Bug reports are not set up for this app (no drop address).' })
	})

	it('refuses without calling fetch when the fingerprint was altered', async () => {
		const { fetchImpl, sleep } = setup()
		const altered = { ...report, fingerprint: '0'.repeat(64) }
		const result = await sendReport(altered, { ...baseOptions, fetchImpl, sleep })
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, message: 'The report changed after you looked at it; make it again.' })
	})
})
