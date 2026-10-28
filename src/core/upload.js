import { dropFileName } from './filename.js'
import { fingerprint } from './zip.js'

// Send to the File Drop (M9, M10): PUT, 201 = sent, retries on 409/423/5xx/network.

/**
 * @param {object} report from buildReport (its fingerprint is checked again)
 * @param {object} options dropBase, dropToken, app, fetchImpl, sleep, now, randomHex
 * @return {Promise<{ ok: boolean, status?: number, message: string }>}
 */
export async function sendReport(report, options) {
	const { dropBase, dropToken, app, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = new Date(), randomHex = randomHexDefault() } = options

	// Check if required configuration is present
	if (!dropBase || !dropToken) {
		return { ok: false, message: 'Bug reports are not set up for this app (no drop address).' }
	}

	// Recompute fingerprint and check it matches
	const computedFingerprint = await fingerprint(report.zip)
	if (computedFingerprint !== report.fingerprint) {
		return { ok: false, message: 'The report changed after you looked at it; make it again.' }
	}

	// Construct the URL
	const url = `${dropBase.replace(/\/$/, '')}/public.php/dav/files/${encodeURIComponent(dropToken)}/${dropFileName(app, now, randomHex)}`

	let lastStatus

	// Try up to 3 times with retries
	for (let i = 0; i < 3; i++) {
		try {
			const response = await fetchImpl(url, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/zip' },
				body: report.zip,
			})

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
		} catch {
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

function randomHexDefault() {
	const bytes = new Uint8Array(4)
	crypto.getRandomValues(bytes)
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
