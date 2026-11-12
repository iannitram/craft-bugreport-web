import { dropFileName } from './filename.js'
import { relayProblem } from './relay.js'
import { fingerprint } from './zip.js'

// Send to the File Drop (M9, M10): PUT, 201 = sent, retries on 409/423/5xx/network.
// Relay mode (relayUrl set): POST multipart to the host's own server, which forwards to the drop.
// A failed relay POST never falls back to a direct drop PUT.

const NOT_SET_UP = 'Bug reports are not set up for this app (no drop address).'
const CHANGED = 'The report changed after you looked at it; make it again.'

// Each try gets this long before it is given up. A stopped send is a failed send, so the consent screen unlocks (#45).
const SEND_TIMEOUT_MS = 30000
const STOPPED_MESSAGE = {
	timeout: 'The send timed out. It is kept; try again.',
	cancelled: 'The send was cancelled. It is kept; try again.',
}

/** Thrown by fetchWithTimeout when a try times out or the caller's signal fires; `reason` is a STOPPED_MESSAGE key. */
class SendStopped extends Error {
	constructor(reason) {
		super(reason)
		this.reason = reason
	}
}

/**
 * @param {object} report from buildReport (its fingerprint is checked again)
 * @param {object} options relayUrl, headers (relay mode); or dropBase, dropToken (direct drop, non-browser hosts only); app, fetchImpl, sleep, now, randomHex; timeoutMs (default 30 s per try), signal (an AbortSignal that cancels the send)
 * @return {Promise<{ ok: boolean, status?: number, message: string }>}
 */
export async function sendReport(report, options) {
	const { relayUrl, headers, dropBase, dropToken, app, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = new Date(), randomHex = randomHexDefault(), timeoutMs = SEND_TIMEOUT_MS, signal } = options

	// Recompute fingerprint and check it matches
	const computedFingerprint = await fingerprint(report.zip)
	if (computedFingerprint !== report.fingerprint) {
		return { ok: false, message: CHANGED }
	}

	if (relayUrl) {
		// Refuses a config that also has a drop token, before anything is sent
		const problem = relayProblem({ relayUrl, dropBase, dropToken })
		if (problem) {
			return { ok: false, message: problem }
		}
		return sendViaRelay(report, { relayUrl, headers, app, fetchImpl, sleep, now, randomHex, timeoutMs, signal })
	}

	// Check if required configuration is present
	if (!dropBase || !dropToken) {
		return { ok: false, message: NOT_SET_UP }
	}

	// Construct the URL
	const url = `${dropBase.replace(/\/$/, '')}/public.php/dav/files/${encodeURIComponent(dropToken)}/${dropFileName(app, now, randomHex)}`

	let lastStatus

	// Try up to 3 times with retries
	for (let i = 0; i < 3; i++) {
		try {
			const response = await fetchWithTimeout(fetchImpl, url, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/zip' },
				body: report.zip,
			}, { timeoutMs, signal })

			lastStatus = response.status

			if (response.status === 201) {
				return { ok: true, status: 201, message: 'Sent. Thank you.' }
			}

			// Retry on specific statuses or network errors
			if ([409, 423].includes(response.status) || response.status >= 500) {
				// Only retry if not the last attempt
				if (i < 2) {
					await sleep(1000 * Math.pow(2, i)) // 1s, then 2s
					continue
				}
			} else {
				// Don't retry for other statuses like 403 or 404
				return { ok: false, status: response.status, message: `The drop refused the report (${response.status}).` }
			}
		} catch (error) {
			// A timeout or a cancel is final: no retry, so the user gets the screen back at once
			if (error instanceof SendStopped) {
				return { ok: false, message: STOPPED_MESSAGE[error.reason] }
			}

			// Retry on network errors if not the last attempt
			if (i < 2) {
				await sleep(1000 * Math.pow(2, i)) // 1s, then 2s
				continue
			}

			// For final failure due to network error, return with last known status or undefined
			return { ok: false, status: lastStatus, message: `Could not send the report (${lastStatus || 'network error'}). It is kept; try again later.` }
		}
	}

	// If we get here, it means all retries failed and we need to return the last known status
	return { ok: false, status: lastStatus, message: `Could not send the report (${lastStatus}). It is kept; try again later.` }
}

/**
 * POST the zip as multipart (one file field, "report") to the host's relay. Retries 5xx and
 * network errors like the drop path; never retries 4xx. The message never includes the response
 * body or headers.
 *
 * @return {Promise<{ ok: boolean, status?: number, message: string }>}
 */
async function sendViaRelay(report, { relayUrl, headers, app, fetchImpl, sleep, now, randomHex, timeoutMs, signal }) {
	const body = new FormData()
	body.append('report', new Blob([report.zip], { type: 'application/zip' }), dropFileName(app, now, randomHex))

	let lastStatus

	for (let i = 0; i < 3; i++) {
		let status
		try {
			const response = await fetchWithTimeout(fetchImpl, relayUrl, {
				method: 'POST',
				headers: { ...headers },
				body,
				credentials: 'same-origin',
				redirect: 'error',
			}, { timeoutMs, signal })
			status = response.status
		} catch (error) {
			if (error instanceof SendStopped) {
				return { ok: false, message: STOPPED_MESSAGE[error.reason] }
			}
			status = undefined
		}
		lastStatus = status

		if (status !== undefined && status >= 200 && status < 300) {
			return { ok: true, status, message: 'Sent. Thank you.' }
		}
		if (status !== undefined && status < 500) {
			return { ok: false, status, message: relayRefusal(status) }
		}
		// 5xx or network error: wait 1s, then 2s, then give up
		if (i < 2) {
			await sleep(1000 * Math.pow(2, i))
		}
	}

	return { ok: false, status: lastStatus, message: 'The report could not be sent; try again later.' }
}

/**
 * @param {number} status a 4xx (or other non-2xx, non-5xx) status from the relay
 * @return {string} the message for the form; it never includes the response body or headers
 */
function relayRefusal(status) {
	if (status === 401 || status === 403) {
		return 'You need to be signed in to send a report.'
	}
	if (status === 413) {
		return 'The report is too large to send.'
	}
	if (status === 429) {
		return 'Too many reports right now; try again in a few minutes.'
	}
	return `The server refused the report (${status}).`
}

/**
 * One fetch that is abandoned after timeoutMs, or when the caller's signal aborts. The request is aborted
 * too. The race means a fetch that ignores its signal still cannot hold the send open. The timer is cleared
 * as soon as the fetch settles.
 *
 * @param {typeof fetch} fetchImpl the fetch to call
 * @param {string} url where to send the request
 * @param {object} init the fetch init (its signal is replaced)
 * @param {{ timeoutMs: number, signal?: AbortSignal }} limits timeoutMs (per try), signal (the caller's AbortSignal, optional)
 * @return {Promise<Response>} rejects with SendStopped when the try is stopped, or with the fetch's own error
 */
async function fetchWithTimeout(fetchImpl, url, init, { timeoutMs, signal }) {
	if (signal?.aborted) {
		throw new SendStopped('cancelled')
	}

	const controller = new AbortController()
	let timer
	let onCallerAbort
	const stopped = new Promise((_, reject) => {
		timer = setTimeout(() => {
			reject(new SendStopped('timeout'))
			controller.abort()
		}, timeoutMs)
		if (signal) {
			onCallerAbort = () => {
				reject(new SendStopped('cancelled'))
				controller.abort()
			}
			signal.addEventListener('abort', onCallerAbort, { once: true })
		}
	})

	try {
		return await Promise.race([fetchImpl(url, { ...init, signal: controller.signal }), stopped])
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener('abort', onCallerAbort)
	}
}

function randomHexDefault() {
	const bytes = new Uint8Array(4)
	crypto.getRandomValues(bytes)
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
