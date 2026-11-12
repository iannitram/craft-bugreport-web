import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ConsentScreen from '../src/components/ConsentScreen.vue'
import ReportButton from '../src/components/ReportButton.vue'
import { buildReport } from '../src/core/report.js'
import { buildZip, fingerprint } from '../src/core/zip.js'

vi.mock('../src/core/report.js', () => ({
	buildReport: vi.fn(),
	MAX_SCREENSHOT_BYTES: 8 * 1024 * 1024,
}))

const config = { app: 'Test app', version: '1.0.0', dropBase: 'https://drop.example.test', dropToken: 'fake-token' }
const NOT_SET_UP = 'Bug reports are not set up for this app (no drop address).'
const CHANGED = 'The report changed after you looked at it; make it again.'
const ZERO_FINGERPRINT = '0'.repeat(64)

let wrappers = []
let fetchMock
let fixture

// A real report (real zip and fingerprint), so sendReport's own checks run.
async function makeReport() {
	const encoder = new TextEncoder()
	const entries = [
		{ name: 'what-happened.txt', data: encoder.encode('What happened:\nThe page froze\n\nWhat I expected:\n\n') },
		{ name: 'app.log', data: encoder.encode('line one') },
		{ name: 'manifest.json', data: encoder.encode('{}') },
		{ name: 'screenshot.png', data: new Uint8Array([137, 80, 78, 71]) },
	]
	const zip = buildZip(entries)
	return {
		files: entries.map(({ name, data }) => ({
			name,
			size: data.byteLength,
			data,
			sentAsIs: name === 'screenshot.png',
		})),
		zip,
		fingerprint: await fingerprint(zip),
		manifest: {},
	}
}

function mountButton(props = {}) {
	const wrapper = mount(ReportButton, {
		props: { config, ...props },
		attachTo: document.body,
		// The dialogs teleport to <body> (#41); stubbed here so wrapper.find reaches them. One test mounts without it.
		global: { stubs: { teleport: true } },
	})
	wrappers.push(wrapper)
	return wrapper
}

function consentDialog() {
	return document.querySelector('[role="dialog"]')
}

function consentStatus() {
	return consentDialog().querySelector('.craft-bugreport-status').textContent.trim()
}

function buttonByText(wrapper, text) {
	return wrapper.findAll('button').find((button) => button.text() === text)
}

// Open the form, fill in "What happened?", make the report. The consent screen opens.
async function makeReportThrough(wrapper) {
	await wrapper.find('button').trigger('click')
	await flushPromises()
	await wrapper.find('textarea').setValue('The page froze')
	await buttonByText(wrapper, 'Make the report').trigger('click')
	await flushPromises()
}

// The digest is async (WebCrypto), so the fixture is made once; tests wait with vi.waitFor.
beforeAll(async () => {
	fixture = await makeReport()
})

beforeEach(() => {
	vi.clearAllMocks()
	buildReport.mockImplementation(async () => ({ ...fixture }))
	fetchMock = vi.fn(async () => ({ status: 201 }))
	vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
	for (const wrapper of wrappers) {
		wrapper.unmount()
	}
	wrappers = []
	document.body.innerHTML = ''
	vi.unstubAllGlobals()
	delete URL.createObjectURL
	delete URL.revokeObjectURL
})

describe('ConsentScreen', () => {
	it('lists every file with its size, marks the sent-as-is file, and says Not sent yet', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		const names = [...consentDialog().querySelectorAll('.craft-bugreport-file__name')].map((el) => el.textContent)
		expect(names).toEqual(['what-happened.txt', 'app.log', 'manifest.json', 'screenshot.png'])
		expect(consentDialog().textContent).toContain('sent as is, not scrubbed')
		expect(consentStatus()).toBe('Not sent yet')

		consentDialog().querySelector('button[aria-label="Show me app.log"]').click()
		await flushPromises()
		expect(consentDialog().querySelector('pre').textContent).toBe('line one')
	})

	it('no fetch call until Send is clicked', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)
		consentDialog().querySelector('button[aria-label="Show me app.log"]').click()
		await flushPromises()

		expect(fetchMock).not.toHaveBeenCalled()

		await buttonByText(wrapper, 'Send').trigger('click')

		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toMatch(/^https:\/\/drop\.example\.test\/public\.php\/dav\/files\/fake-token\/Testapp-web-.*\.zip$/)
		expect(init.method).toBe('PUT')
	})

	it('Send with a mocked 201 shows "Sent" and replaces Send with Close', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		await buttonByText(wrapper, 'Send').trigger('click')

		await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
		expect(consentDialog().textContent).toContain('Sent. Thank you.')
		expect(buttonByText(wrapper, 'Send')).toBeUndefined()
		expect(buttonByText(wrapper, 'Close')).toBeDefined()
	})

	it('a changed fingerprint shows the refusal and makes no fetch call', async () => {
		buildReport.mockImplementationOnce(async () => ({ ...fixture, fingerprint: ZERO_FINGERPRINT }))
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		await buttonByText(wrapper, 'Send').trigger('click')

		await vi.waitFor(() => expect(consentDialog().textContent).toContain(CHANGED))
		expect(consentStatus()).toBe('Not sent yet')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('Delete clears the report, so ReportButton no longer renders it', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)
		expect(consentDialog()).not.toBeNull()

		await buttonByText(wrapper, 'Delete').trigger('click')
		await flushPromises()

		expect(consentDialog()).toBeNull()
		expect(wrapper.findComponent(ConsentScreen).exists()).toBe(false)
		expect(buttonByText(wrapper, 'Review the kept report')).toBeUndefined()
	})

	it('missing drop config shows the "not set up" message and disables Send', async () => {
		const wrapper = mountButton({ config: { ...config, dropBase: '', dropToken: '' } })
		await makeReportThrough(wrapper)

		expect(consentDialog().textContent).toContain(NOT_SET_UP)
		expect(buttonByText(wrapper, 'Send').element.disabled).toBe(true)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('Keep closes the screen; reopening shows the kept report, still not sent', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		await buttonByText(wrapper, 'Keep').trigger('click')
		await flushPromises()
		expect(consentDialog()).toBeNull()

		await buttonByText(wrapper, 'Review the kept report').trigger('click')
		await flushPromises()
		expect(consentStatus()).toBe('Not sent yet')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('after Sent the only action is Close, which has focus and closes the screen for good (#41)', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)
		await buttonByText(wrapper, 'Send').trigger('click')
		await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
		await flushPromises()

		const actions = [...consentDialog().querySelectorAll('.craft-bugreport-actions button')].map((button) => button.textContent.trim())
		expect(actions).toEqual(['Close'])
		expect(document.activeElement).toBe(buttonByText(wrapper, 'Close').element)

		await buttonByText(wrapper, 'Close').trigger('click')
		await flushPromises()
		expect(consentDialog()).toBeNull()
		expect(buttonByText(wrapper, 'Review the kept report')).toBeUndefined()
		expect(document.activeElement).toBe(wrapper.find('button').element)
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('the screen closes on its own 5 seconds after Sent (#41)', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)
		vi.useFakeTimers()
		try {
			await buttonByText(wrapper, 'Send').trigger('click')
			await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
			await vi.advanceTimersByTimeAsync(4900)
			expect(consentDialog()).not.toBeNull()
			await vi.advanceTimersByTimeAsync(200)
			expect(consentDialog()).toBeNull()
			expect(buttonByText(wrapper, 'Review the kept report')).toBeUndefined()
		} finally {
			vi.useRealTimers()
		}
	})

	it('the corner × keeps an unsent report and closes a sent one (#41)', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)
		const corner = () => consentDialog().querySelector('button[aria-label="Close"]')
		expect(corner()).not.toBeNull()

		corner().click()
		await flushPromises()
		expect(consentDialog()).toBeNull()
		await buttonByText(wrapper, 'Review the kept report').trigger('click')
		await flushPromises()

		await buttonByText(wrapper, 'Send').trigger('click')
		await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
		corner().click()
		await flushPromises()
		expect(consentDialog()).toBeNull()
		expect(buttonByText(wrapper, 'Review the kept report')).toBeUndefined()
	})

	it('the form and the consent screen render at page level, so a host sidebar cannot hold them (#41)', async () => {
		const host = document.createElement('nav')
		host.style.transform = 'translateX(0)'
		document.body.appendChild(host)
		const wrapper = mount(ReportButton, { props: { config }, attachTo: host })
		wrappers.push(wrapper)

		host.querySelector('button').click()
		await flushPromises()
		const form = document.querySelector('[role="dialog"]')
		expect(form).not.toBeNull()
		expect(host.contains(form)).toBe(false)

		document.querySelector('textarea').value = 'The page froze'
		document.querySelector('textarea').dispatchEvent(new Event('input'))
		;[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Make the report').click()
		await flushPromises()
		expect(consentDialog()).not.toBeNull()
		expect(host.contains(consentDialog())).toBe(false)
	})

	it('focus moves into the consent screen after the form builds a report, and back to the button when it closes', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		const title = document.getElementById(consentDialog().getAttribute('aria-labelledby'))
		expect(document.activeElement).toBe(title)

		await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
		await flushPromises()

		expect(consentDialog()).toBeNull()
		expect(document.activeElement).toBe(wrapper.find('button').element)
	})

	// Closing during a pending send (#43): the close controls do nothing until the send's result is in.
	describe('closing while a send is pending (#43)', () => {
		// The next fetch stays pending until the test resolves it with a response.
		function holdNextSend() {
			let release
			fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
				release = resolve
			}))
			return (response) => release(response)
		}

		// Starts a send and waits until its PUT is in flight.
		async function startPendingSend(wrapper) {
			await makeReportThrough(wrapper)
			await buttonByText(wrapper, 'Send').trigger('click')
			await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		}

		// The result landed on the open screen: it says Sent, offers no Send, and Close is the only action.
		// Closing a sent report is done with it, so nothing reopens and no second fetch can happen.
		async function expectSentWithNoSecondFetch(wrapper) {
			expect(consentStatus()).toBe('Sent')
			expect(buttonByText(wrapper, 'Send')).toBeUndefined()
			await buttonByText(wrapper, 'Close').trigger('click')
			await flushPromises()
			expect(consentDialog()).toBeNull()
			expect(buttonByText(wrapper, 'Review the kept report')).toBeUndefined()
			expect(fetchMock).toHaveBeenCalledTimes(1)
		}

		it('the corner × is ignored during a pending send, and a 201 still marks the report Sent', async () => {
			const wrapper = mountButton()
			const resolveSend = holdNextSend()
			await startPendingSend(wrapper)

			consentDialog().querySelector('button[aria-label="Close"]').click()
			await flushPromises()
			expect(consentDialog()).not.toBeNull()

			resolveSend({ status: 201 })
			await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
			await expectSentWithNoSecondFetch(wrapper)
		})

		it('Escape is ignored during a pending send, and a 201 still marks the report Sent', async () => {
			const wrapper = mountButton()
			const resolveSend = holdNextSend()
			await startPendingSend(wrapper)

			consentDialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
			await flushPromises()
			expect(consentDialog()).not.toBeNull()

			resolveSend({ status: 201 })
			await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
			await expectSentWithNoSecondFetch(wrapper)
		})

		it('Keep is disabled during a pending send, and a 201 still marks the report Sent', async () => {
			const wrapper = mountButton()
			const resolveSend = holdNextSend()
			await startPendingSend(wrapper)

			expect(buttonByText(wrapper, 'Keep').element.disabled).toBe(true)
			await buttonByText(wrapper, 'Keep').trigger('click')
			await flushPromises()
			expect(consentDialog()).not.toBeNull()

			resolveSend({ status: 201 })
			await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
			await expectSentWithNoSecondFetch(wrapper)
		})
	})

	it('a shown image comes from an object URL that is revoked on Keep', async () => {
		URL.createObjectURL = vi.fn(() => 'blob:consent-test')
		URL.revokeObjectURL = vi.fn()
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		consentDialog().querySelector('button[aria-label="Show me screenshot.png"]').click()
		await flushPromises()
		expect(consentDialog().querySelector('img').getAttribute('src')).toBe('blob:consent-test')

		await buttonByText(wrapper, 'Keep').trigger('click')
		await flushPromises()
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:consent-test')
	})

	it('a failed send (500 on every try) shows the failure message, not "Sent", and Send is enabled again', async () => {
		fetchMock.mockImplementation(async () => ({ status: 500 }))
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		// sendReport waits 1s, then 2s, between its three tries; fake timers make those waits instant.
		vi.useFakeTimers()
		try {
			await buttonByText(wrapper, 'Send').trigger('click')
			// The digest is async (WebCrypto), so wait for the first try, then run the 1s and 2s waits.
			await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
			await vi.advanceTimersByTimeAsync(1000)
			await vi.advanceTimersByTimeAsync(2000)

			await vi.waitFor(() => expect(consentDialog().textContent).toContain('Could not send the report (500). It is kept; try again later.'))
			expect(fetchMock).toHaveBeenCalledTimes(3)
			expect(consentStatus()).toBe('Not sent yet')
			expect(consentDialog().textContent).not.toContain('Sent. Thank you.')
			expect(buttonByText(wrapper, 'Send').element.disabled).toBe(false)
		} finally {
			vi.useRealTimers()
		}
	})
})

describe('ConsentScreen send timeout (#45)', () => {
	it('a send that never settles shows the timeout failure, and × and Keep are enabled again', async () => {
		// The send hangs until its abort signal fires, as a stalled connection would.
		fetchMock.mockImplementationOnce((url, init) => new Promise((resolve, reject) => {
			init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
		}))
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		try {
			await buttonByText(wrapper, 'Send').trigger('click')
			await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
			expect(buttonByText(wrapper, 'Keep').element.disabled).toBe(true)

			await vi.advanceTimersByTimeAsync(30_000)
			await vi.waitFor(() => expect(consentDialog().textContent).toContain('The send timed out. It is kept; try again.'))
		} finally {
			vi.useRealTimers()
		}

		expect(consentStatus()).toBe('Not sent yet')
		expect(consentDialog().textContent).not.toContain('Sent. Thank you.')
		expect(buttonByText(wrapper, 'Send').element.disabled).toBe(false)
		expect(buttonByText(wrapper, 'Keep').element.disabled).toBe(false)
		expect(consentDialog().querySelector('button[aria-label="Close"]').disabled).toBe(false)

		await buttonByText(wrapper, 'Keep').trigger('click')
		await flushPromises()
		expect(consentDialog()).toBeNull()
	})
})
