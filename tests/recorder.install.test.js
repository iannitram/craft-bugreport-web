import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installErrorBuffer, timelineEvents } from '../src/core/errorBuffer.js'
import { createTimeline, getOriginalFetch, installRecorder, markEvent } from '../src/core/recorder.js'

describe('page recorder hooks', () => {
	let timeline
	let recorder
	let originalFetch
	let originalPushState

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
		originalFetch = window.fetch
		originalPushState = window.history.pushState
		timeline = createTimeline()
		recorder = installRecorder({ timeline, userName: 'alice' })
	})

	afterEach(() => {
		recorder?.uninstall()
		vi.unstubAllGlobals()
		vi.useRealTimers()
	})

	it('records clicks, history and browser route events in order', () => {
		const button = document.createElement('button')
		button.textContent = 'Open dashboard for alice'
		document.body.append(button)
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		expect(window.history.pushState({}, '', '/projects/alice')).toBeUndefined()
		expect(window.history.replaceState({}, '', '/settings/alice')).toBeUndefined()
		window.dispatchEvent(new PopStateEvent('popstate'))
		window.dispatchEvent(new HashChangeEvent('hashchange'))

		expect(timeline.events(new Date()).map(({ kind }) => kind)).toEqual(['click', 'route', 'route', 'route', 'route'])
		expect(timeline.events(new Date())[0]).toMatchObject({ role: 'button', label: 'Open dashboard for <user>' })
		expect(timeline.events(new Date())[1].path).toBe('/projects/<user>')
		expect(timeline.events(new Date())[2].path).toBe('/settings/<user>')
	})

	it('records private controls without recording their typed value and masks/truncates click labels', () => {
		const input = document.createElement('input')
		input.value = 'secret typed words'
		document.body.append(input)
		input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		const privateArea = document.createElement('div')
		privateArea.setAttribute('contenteditable', 'plaintext-only')
		privateArea.textContent = 'secret editable words'
		document.body.append(privateArea)
		privateArea.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		const privateButton = document.createElement('button')
		privateButton.dataset.bugreportPrivate = ''
		privateButton.textContent = 'secret protected words'
		document.body.append(privateButton)
		privateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		const longButton = document.createElement('button')
		longButton.textContent = `${'x'.repeat(45)} alice`
		document.body.append(longButton)
		longButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		const events = timeline.events(new Date())
		expect(events.slice(0, 3).map(({ label }) => label)).toEqual(['<private>', '<private>', '<private>'])
		expect(events[3].label).toHaveLength(40)
		expect(JSON.stringify(events)).not.toMatch(/secret|alice/)
	})

	it('records only failing fetches, preserving the response and rejection', async () => {
		const success = { status: 200, marker: 'success' }
		const failure = { status: 503, marker: 'failure' }
		const networkError = new TypeError('network unreachable')
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(success)
			.mockResolvedValueOnce(failure)
			.mockRejectedValueOnce(networkError)
		vi.stubGlobal('fetch', fetchMock)
		const active = installRecorder({ timeline, userName: 'alice' })
		try {
			const okResult = await window.fetch('/api/alice?secret=private')
			const failedResult = await window.fetch('/api/report.json')
			expect(okResult).toBe(success)
			expect(failedResult).toBe(failure)
			await expect(window.fetch('/api/network')).rejects.toBe(networkError)
			expect(timeline.events(new Date()).filter((event) => event.kind === 'request')).toEqual([
				expect.objectContaining({ method: 'GET', path: '/api/<file>', status: 503 }),
				expect.objectContaining({ method: 'GET', path: '/api/network', status: 0 }),
			])
			expect(getOriginalFetch()).toBe(fetchMock)
		} finally {
			active.uninstall()
		}
	})

	it('records failed XHR statuses and network errors, and restores open/send', () => {
		recorder.uninstall()
		const proto = XMLHttpRequest.prototype
		const open = proto.open
		const send = proto.send
		const openSpy = vi.spyOn(proto, 'open').mockImplementation(function (method, url) {
			this.testRequest = { method, url }
		})
		const sendSpy = vi.spyOn(proto, 'send').mockImplementation(function () {
			if (this.testRequest.url === '/xhr/pending') {
				Object.defineProperty(this, 'status', { configurable: true, value: 404 })
				return
			}
			const status = this.testRequest.url === '/xhr/failed' ? 404 : this.testRequest.url === '/xhr/ok' ? 200 : 0
			Object.defineProperty(this, 'status', { configurable: true, value: status })
			this.dispatchEvent(new Event(status ? 'loadend' : 'error'))
			this.dispatchEvent(new Event('loadend'))
		})
		recorder = installRecorder({ timeline, userName: 'alice' })
		let pending
		try {
			const failed = new XMLHttpRequest()
			failed.open('POST', '/xhr/failed')
			failed.send('body must not be recorded')
			const network = new XMLHttpRequest()
			network.open('GET', '/xhr/network')
			network.send()
			const successful = new XMLHttpRequest()
			successful.open('GET', '/xhr/ok')
			successful.send()
			pending = new XMLHttpRequest()
			pending.open('GET', '/xhr/pending')
			pending.send()
			expect(timeline.events(new Date()).filter((event) => event.kind === 'request')).toEqual([
				expect.objectContaining({ method: 'POST', path: '/xhr/failed', status: 404 }),
				expect.objectContaining({ method: 'GET', path: '/xhr/network', status: 0 }),
			])
		} finally {
			recorder.uninstall()
			openSpy.mockRestore()
			sendSpy.mockRestore()
		}
		pending.dispatchEvent(new Event('loadend'))
		expect(timeline.events(new Date()).filter((event) => event.kind === 'request')).toHaveLength(2)
		expect(proto.open).toBe(open)
		expect(proto.send).toBe(send)
	})

	it('records window errors, unhandled rejections and host marks, and does not keep old events', () => {
		window.dispatchEvent(new ErrorEvent('error', { message: 'alice failed at /home/alice/project' }))
		const rejection = new Event('unhandledrejection')
		Object.defineProperty(rejection, 'reason', { value: new Error('rejected') })
		window.dispatchEvent(rejection)
		markEvent('Saved by alice')
		expect(timeline.events(new Date()).map(({ kind }) => kind)).toEqual(['error', 'error', 'mark'])
		expect(JSON.stringify(timeline.events(new Date()))).not.toMatch(/alice|\/home/)
		vi.advanceTimersByTime(60001)
		expect(timeline.events(new Date())).toEqual([])
	})

	it('restores hooks and removes listeners on uninstall; markEvent is a no-op outside install', () => {
		const fetchBefore = originalFetch
		recorder.uninstall()
		const count = timeline.events(new Date()).length
		markEvent('ignored')
		window.history.pushState({}, '', '/after-uninstall')
		window.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		expect(timeline.events(new Date())).toHaveLength(count)
		expect(window.fetch).toBe(fetchBefore)
		expect(window.history.pushState).toBe(originalPushState)
		expect(() => markEvent('still safe')).not.toThrow()
	})
})

describe('installErrorBuffer timeline integration', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('starts one recorder by default, returns current timeline events, and honors timeline false', () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
		const buffer = installErrorBuffer()
		const sameBuffer = installErrorBuffer()
		try {
			markEvent('host event')
			expect(sameBuffer).toBe(buffer)
			expect(timelineEvents()).toEqual(buffer.timelineEvents())
			expect(timelineEvents()).toMatchObject([{ kind: 'mark', name: 'host event' }])
		} finally {
			buffer.uninstall()
		}
		const disabled = installErrorBuffer({ timeline: false })
		try {
			markEvent('not captured')
			expect(timelineEvents()).toEqual([])
		} finally {
			disabled.uninstall()
		}
	})
})
