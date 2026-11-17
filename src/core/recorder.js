// Flight recorder (1.1, M12-M13): the last 60 seconds of what the user did. See docs/code-map.md.
import { maskText } from './mask.js'
import { NotBuilt } from './notBuilt.js'
import { maskLogLine } from './report.js'

export function createTimeline({ windowMs = 60000, max = 100 } = {}) {
	const events = []

	return {
		add(event) {
			if (event === null || event === undefined) {
				return
			}

			events.push(event)

			// Keep only the newest max events
			if (events.length > max) {
				events.shift()
			}
		},

		events(now) {
			const cutoff = now.getTime() - windowMs
			// Filter events within the time window and return a copy
			return events.filter((event) => Date.parse(event.t) >= cutoff).slice()
		},

		clear() {
			events.length = 0
		},
	}
}

export function maskPath(url, userName) {
	let pathname
	try {
		pathname = new URL(url, 'http://x.invalid').pathname
	} catch {
		return '<url>'
	}

	const parts = pathname
		.split('/')
		.filter(Boolean)
		.map((part) => {
			let decoded
			try {
				decoded = decodeURIComponent(part)
			} catch {
				decoded = part
			}

			if (userName && decoded === userName) {
				return '<user>'
			}
			if (decoded.includes('.')) {
				return '<file>'
			}
			if (decoded.length >= 24) {
				return '<id>'
			}
			return decoded
		})
	const truncated = parts.length > 6
	return `/${parts.slice(0, 6).join('/')}${truncated ? '/…' : ''}`
}

export function clickLabel(element, userName) {
	if (!element || typeof element.closest !== 'function') {
		return null
	}
	if (element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-bugreport-private]')) {
		return { role: 'private', label: '<private>' }
	}

	const target = element.closest('button, a, summary, [role="button"], [role="menuitem"], [role="tab"], [role="link"], [role="checkbox"], [role="option"]')
	if (!target) {
		return null
	}

	const tag = target.tagName
	const role = target.getAttribute('role') || (tag === 'BUTTON' || tag === 'SUMMARY' ? 'button' : tag === 'A' ? 'link' : '')
	let label = ''
	for (const candidate of [target.getAttribute('aria-label'), target.getAttribute('title'), target.textContent]) {
		const normalized = String(candidate ?? '').replace(/\s+/g, ' ').trim()
		if (normalized) {
			label = normalized
			break
		}
	}
	label = label ? maskText(label, { userName }).slice(0, 40) : '<no label>'
	return { role, label }
}

export function formatEvent(kind, detail, date, userName) {
	const t = date.toISOString()
	if (kind === 'route') {
		return { t, kind, path: maskPath(detail.url, userName) }
	}
	if (kind === 'click') {
		const label = clickLabel(detail.element, userName)
		return label ? { t, kind, ...label } : null
	}
	if (kind === 'request') {
		return {
			t,
			kind,
			method: String(detail.method || 'GET').toUpperCase(),
			path: maskPath(detail.url, userName),
			status: Number(detail.status) || 0,
		}
	}
	if (kind === 'error') {
		return { t, kind, message: maskLogLine(String(detail.message ?? ''), userName).slice(0, 120) }
	}
	if (kind === 'mark') {
		return { t, kind, name: maskText(String(detail.name ?? ''), { userName }).slice(0, 40) }
	}
	return null
}

export function installRecorder(...args) {
	throw new NotBuilt('installRecorder', ...args)
}

export function markEvent(...args) {
	throw new NotBuilt('markEvent', ...args)
}
