// Relay mode: the page POSTs the zip to a URL on the host's own origin, and the host's server
// forwards it to the File Drop. The browser never sees a drop address or token in relay mode.

export const CONFLICT_MESSAGE = 'Use relayUrl or dropBase/dropToken, not both; a page must use relayUrl.'
export const BAD_RELAY_MESSAGE = "relayUrl must be a relative path such as /apps/<app>/api/bug-report, or an https URL on this page's own origin."

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1']

/**
 * Check a config's relay settings without touching the network. A config that sets relayUrl
 * must not also set dropBase or dropToken: a page uses the relay and nothing else.
 *
 * @param {{ relayUrl?: string, dropBase?: string, dropToken?: string }} config the host's settings
 * @return {string} the problem to show the user, or '' when the relay settings are usable (or relayUrl is not set)
 */
export function relayProblem(config = {}) {
	const { relayUrl, dropBase, dropToken } = config
	if (!relayUrl) {
		return ''
	}
	if (dropBase || dropToken) {
		return CONFLICT_MESSAGE
	}
	return isAllowedRelayUrl(relayUrl) ? '' : BAD_RELAY_MESSAGE
}

/**
 * A relay URL must resolve to the page's own origin, and must be https (or http on loopback
 * for local development). Credentials in the URL are refused.
 *
 * @param {string} relayUrl a relative path or an absolute URL
 * @return {boolean}
 */
export function isAllowedRelayUrl(relayUrl) {
	// An empty string would resolve to the page itself, so it is refused.
	if (typeof relayUrl !== 'string' || relayUrl.trim() === '' || !globalThis.location) {
		return false
	}
	let url
	try {
		url = new URL(relayUrl, globalThis.location.href)
	} catch {
		return false
	}
	if (url.username || url.password || url.origin !== globalThis.location.origin) {
		return false
	}
	if (url.protocol === 'https:') {
		return true
	}
	return url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname)
}
