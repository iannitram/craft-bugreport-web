import { NotBuilt } from './notBuilt.js'

// Send to the File Drop (M9, M10): PUT, 201 = sent, retries on 409/423/5xx/network.

/**
 * @param {object} report from buildReport (its fingerprint is checked again)
 * @param {object} options dropBase, dropToken, app, fetchImpl, sleep, now, randomHex
 * @return {Promise<{ ok: boolean, status?: number, message: string }>}
 */
export async function sendReport(report, options) {
	throw new NotBuilt('sendReport', report, options)
}
