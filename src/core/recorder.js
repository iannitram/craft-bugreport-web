// Flight recorder (1.1, M12-M13): the last 60 seconds of what the user did. See docs/code-map.md.
import { maskText } from './mask.js'
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
			if (/[?#&=]/.test(decoded)) {
				return '<id>'
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
	if (element.closest('input, textarea, select, [contenteditable], [data-bugreport-private]')) {
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

let activeRecorder = null

function eventMessage(value) {
	if (value instanceof Error) {
		return `${value.name}: ${value.message}`
	}
	if (typeof value === 'string') {
		return value
	}
	try {
		return String(value?.message ?? value)
	} catch {
		return 'Unknown error'
	}
}

function descriptorFor(object, key) {
	return Object.getOwnPropertyDescriptor(object, key)
}

function restoreProperty(object, key, descriptor) {
	if (descriptor) {
		Object.defineProperty(object, key, descriptor)
	} else {
		delete object[key]
	}
}

/**
 * Install page hooks that append masked, metadata-only events to a timeline.
 * @param {{ timeline: ReturnType<typeof createTimeline>, userName?: string }} options
 * @return {{ uninstall: () => void }}
 */
export function installRecorder({ timeline, userName } = {}) {
	if (!timeline || typeof timeline.add !== 'function') {
		throw new TypeError('installRecorder requires a timeline')
	}
	const page = globalThis.window
	if (!page) {
		return { uninstall() {} }
	}
	let installed = true
	const originalFetch = typeof page.fetch === 'function' ? page.fetch : null
	const history = page.history
	const xhrPrototype = page.XMLHttpRequest?.prototype
	const historyDescriptors = new Map()
	const xhrDescriptors = new Map()
	const xhrRequests = new WeakMap()
	const pendingXhrListeners = new Set()

	const add = (kind, detail) => timeline.add(formatEvent(kind, detail, new Date(), userName))
	const onClick = (event) => {
		const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement
		add('click', { element: target })
	}
	const onRoute = () => add('route', { url: page.location.href })
	const onError = (event) => add('error', { message: eventMessage(event.message || event.error) })
	const onUnhandled = (event) => add('error', { message: `Unhandled rejection: ${eventMessage(event.reason)}` })

	for (const method of ['pushState', 'replaceState']) {
		const descriptor = descriptorFor(history, method)
		const original = history[method]
		if (typeof original !== 'function') {
			continue
		}
		historyDescriptors.set(method, descriptor)
		Object.defineProperty(history, method, {
			configurable: true,
			writable: true,
			value: function(...args) {
				const result = Reflect.apply(original, this, args)
				onRoute()
				return result
			},
		})
	}

	page.addEventListener('popstate', onRoute)
	page.addEventListener('hashchange', onRoute)
	page.addEventListener('click', onClick, { capture: true, passive: true })
	page.addEventListener('error', onError)
	page.addEventListener('unhandledrejection', onUnhandled)

	if (originalFetch) {
		page.fetch = function(...args) {
			const request = args[0]
			const init = args[1]
			const url = typeof request === 'string' ? request : request?.url ?? request?.href
			const method = init?.method || request?.method || 'GET'
			const result = Reflect.apply(originalFetch, this, args)
			return Promise.resolve(result).then((response) => {
				if (response.status >= 400) {
					add('request', { url, method, status: response.status })
				}
				return response
			}, (error) => {
				add('request', { url, method, status: 0 })
				throw error
			})
		}
	}

	if (xhrPrototype) {
		for (const method of ['open', 'send']) {
			const descriptor = descriptorFor(xhrPrototype, method)
			const original = xhrPrototype[method]
			if (typeof original !== 'function') {
				continue
			}
			xhrDescriptors.set(method, descriptor)
			const value = method === 'open'
				? function(requestMethod, url, ...args) {
					xhrRequests.set(this, { method: requestMethod, url, recorded: false })
					return Reflect.apply(original, this, [requestMethod, url, ...args])
				}
				: function(...args) {
					const xhr = this
					const request = xhrRequests.get(xhr)
					const finish = (status) => {
						cleanup()
						if (status === null || !request || request.recorded) {
							return
						}
						request.recorded = true
						add('request', { url: request.url, method: request.method, status })
					}
					const onLoadEnd = () => finish(xhr.status >= 400 ? xhr.status : null)
					const onNetworkError = () => finish(0)
					const cleanup = () => {
						xhr.removeEventListener('loadend', onLoadEnd)
						xhr.removeEventListener('error', onNetworkError)
						pendingXhrListeners.delete(cleanup)
					}
					pendingXhrListeners.add(cleanup)
					xhr.addEventListener('loadend', onLoadEnd)
					xhr.addEventListener('error', onNetworkError)
					try {
						return Reflect.apply(original, xhr, args)
					} catch (error) {
						cleanup()
						throw error
					}
				}
			Object.defineProperty(xhrPrototype, method, { configurable: true, writable: true, value })
		}
	}

	const handle = {
		originalFetch,
		addMark(name) {
			add('mark', { name })
		},
		uninstall() {
			if (!installed) {
				return
			}
			installed = false
			for (const [method, descriptor] of historyDescriptors) {
				restoreProperty(history, method, descriptor)
			}
			for (const [method, descriptor] of xhrDescriptors) {
				restoreProperty(xhrPrototype, method, descriptor)
			}
			for (const cleanup of pendingXhrListeners) {
				cleanup()
			}
			if (originalFetch && page.fetch !== originalFetch) {
				page.fetch = originalFetch
			}
			page.removeEventListener('popstate', onRoute)
			page.removeEventListener('hashchange', onRoute)
			page.removeEventListener('click', onClick, true)
			page.removeEventListener('error', onError)
			page.removeEventListener('unhandledrejection', onUnhandled)
			if (activeRecorder === handle) {
				activeRecorder = null
			}
		},
	}
	activeRecorder = handle
	return handle
}

/** Add a host-provided event to the currently installed timeline. */
export function markEvent(name) {
	if (!activeRecorder) {
		return
	}
	activeRecorder.addMark(name)
}

/** Return the unwrapped page fetch while the recorder is installed. */
export function getOriginalFetch() {
	return activeRecorder?.originalFetch ?? globalThis.fetch
}
