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

const CONFLICT = 'Use relayUrl or dropBase/dropToken, not both; a page must use relayUrl.'

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

// Relay mode: the options carry no drop address or token at all.
const RELAY = '/apps/outliner/api/bug-report'
const RELAY_FILE_NAME = 'Outliner-web-20261026T210509Z-0a1b2c3d.zip'

function relayOptions(extra = {}) {
	return {
		relayUrl: RELAY,
		headers: { requesttoken: 'TEST-TOKEN' },
		app: 'Outliner',
		now: baseOptions.now,
		randomHex: '0a1b2c3d',
		...extra,
	}
}

// Every string the request carries: URL, header names and values, and FormData names and file names.
function requestTexts(url, init) {
	const texts = [String(url), ...Object.entries(init.headers ?? {}).flat()]
	for (const [name, value] of init.body.entries()) {
		texts.push(name)
		texts.push(typeof value === 'string' ? value : value.name)
	}
	return texts
}

describe('sendReport in relay mode', () => {
	it('POSTs the exact zip bytes as multipart with the file name and the configured headers', async () => {
		const { fetchImpl, sleep } = setup(201)
		const result = await sendReport(report, relayOptions({ fetchImpl, sleep }))

		expect(fetchImpl).toHaveBeenCalledTimes(1)
		const [url, init] = fetchImpl.mock.calls[0]
		expect(url).toBe(RELAY)
		expect(init.method).toBe('POST')
		expect(init.headers).toEqual({ requesttoken: 'TEST-TOKEN' })
		expect(init.credentials).toBe('same-origin')
		expect(init.redirect).toBe('error')
		expect(init.body).toBeInstanceOf(FormData)
		expect([...init.body.keys()]).toEqual(['report'])
		const file = init.body.get('report')
		expect(file.name).toBe(RELAY_FILE_NAME)
		expect(file.type).toBe('application/zip')
		expect(new Uint8Array(await file.arrayBuffer())).toEqual(report.zip)
		expect(result).toEqual({ ok: true, status: 201, message: 'Sent. Thank you.' })
	})

	it('S1: the request has no drop token, drop address or drop path, and only the configured headers', () => {
		const { fetchImpl, sleep } = setup(201)
		return sendReport(report, relayOptions({ fetchImpl, sleep })).then(() => {
			const [url, init] = fetchImpl.mock.calls[0]
			expect(Object.keys(init.headers)).toEqual(['requesttoken'])
			const texts = requestTexts(url, init).join('\n')
			expect(texts).not.toContain('FAKETOKEN')
			expect(texts).not.toContain('drop.example.test')
			expect(texts).not.toContain('public.php/dav')
		})
	})

	it('S2: refuses a config with relayUrl and dropToken before any fetch', async () => {
		const { fetchImpl, sleep } = setup(201)
		const result = await sendReport(report, relayOptions({ dropToken: 'FAKETOKEN', fetchImpl, sleep }))
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, message: CONFLICT })
	})

	it('S2: refuses a config with relayUrl and dropBase before any fetch', async () => {
		const { fetchImpl, sleep } = setup(201)
		const result = await sendReport(report, relayOptions({ dropBase: 'https://drop.example.test', fetchImpl, sleep }))
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, message: CONFLICT })
	})

	it.each([
		['a cross-origin absolute https URL', 'https://drop.example.test/apps/x/api/bug-report'],
		['a protocol-relative URL to another host', '//drop.example.test/apps/x/api/bug-report'],
		['plain http on a non-loopback host', 'http://example.test/apps/x/api/bug-report'],
		['another loopback port (a different origin)', 'http://127.0.0.1:3000/apps/x/api/bug-report'],
		['a URL with credentials', 'http://user:pass@localhost:3000/apps/x/api/bug-report'],
	])('S4: refuses relayUrl as %s without any fetch', async (_label, relayUrl) => {
		const { fetchImpl, sleep } = setup(201)
		const result = await sendReport(report, relayOptions({ relayUrl, fetchImpl, sleep }))
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(result.ok).toBe(false)
		expect(result.message).toMatch(/^relayUrl must be/)
	})

	it.each([
		[401, 'You need to be signed in to send a report.'],
		[403, 'You need to be signed in to send a report.'],
		[413, 'The report is too large to send.'],
		[429, 'Too many reports right now; try again in a few minutes.'],
		[404, 'The server refused the report (404).'],
	])('a %i from the relay gives its message and is not retried', async (status, message) => {
		const { fetchImpl, sleep } = setup(status)
		const result = await sendReport(report, relayOptions({ fetchImpl, sleep }))
		expect(fetchImpl).toHaveBeenCalledTimes(1)
		expect(sleep).not.toHaveBeenCalled()
		expect(result).toEqual({ ok: false, status, message })
	})

	it('a 5xx retries three times, waiting 1000 then 2000, then gives the final message', async () => {
		const { fetchImpl, sleep } = setup(503, 503, 503)
		const result = await sendReport(report, relayOptions({ fetchImpl, sleep }))
		expect(fetchImpl).toHaveBeenCalledTimes(3)
		expect(sleep.mock.calls).toEqual([[1000], [2000]])
		expect(result).toEqual({ ok: false, status: 503, message: 'The report could not be sent; try again later.' })
	})

	it('a network error retries three times and then gives the final message', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError('Failed to fetch')
		})
		const sleep = vi.fn(async () => {})
		const result = await sendReport(report, relayOptions({ fetchImpl, sleep }))
		expect(fetchImpl).toHaveBeenCalledTimes(3)
		expect(result).toEqual({ ok: false, message: 'The report could not be sent; try again later.' })
	})

	it('a 2xx other than 201 counts as sent', async () => {
		const { fetchImpl, sleep } = setup(200)
		const result = await sendReport(report, relayOptions({ fetchImpl, sleep }))
		expect(result).toEqual({ ok: true, status: 200, message: 'Sent. Thank you.' })
	})

	it('S3: the messages never contain the response body or headers', async () => {
		const marker = 'MARKER-RESPONSE-7731'
		const messages = []
		for (const status of [401, 413, 429, 503]) {
			const fetchImpl = vi.fn(async () => ({
				status,
				headers: new Map([['x-debug', marker]]),
				text: async () => marker,
			}))
			const result = await sendReport(report, relayOptions({ fetchImpl, sleep: async () => {} }))
			expect(JSON.stringify(result)).not.toContain(marker)
			messages.push(result.message)
		}
		expect(new Set(messages).size).toBe(4)
	})

	it('S5: a failed relay POST never falls back to a direct drop PUT', async () => {
		const failures = [async () => ({ status: 401 }), async () => ({ status: 503 }), async () => {
			throw new TypeError('Failed to fetch')
		}]
		for (const failure of failures) {
			const fetchImpl = vi.fn(failure)
			await sendReport(report, relayOptions({ fetchImpl, sleep: async () => {} }))
			expect(fetchImpl).toHaveBeenCalled()
			for (const [url, init] of fetchImpl.mock.calls) {
				expect(url).toBe(RELAY)
				expect(init.method).toBe('POST')
			}
		}
	})

	it('S5: with drop options also present, the relay config is refused and nothing is sent', async () => {
		const { fetchImpl, sleep } = setup(503)
		const result = await sendReport(report, { ...baseOptions, relayUrl: RELAY, headers: {}, fetchImpl, sleep })
		expect(fetchImpl).not.toHaveBeenCalled()
		expect(result.message).toBe(CONFLICT)
	})
})
