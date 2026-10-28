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

	it('Send with a mocked 201 shows "Sent" and disables Send', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)

		await buttonByText(wrapper, 'Send').trigger('click')

		await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))
		expect(consentDialog().textContent).toContain('Sent. Thank you.')
		expect(buttonByText(wrapper, 'Send').element.disabled).toBe(true)
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

	it('Keep closes the screen; reopening shows the kept report with its "Sent" state', async () => {
		const wrapper = mountButton()
		await makeReportThrough(wrapper)
		await buttonByText(wrapper, 'Send').trigger('click')
		await vi.waitFor(() => expect(consentStatus()).toBe('Sent'))

		await buttonByText(wrapper, 'Keep').trigger('click')
		await flushPromises()
		expect(consentDialog()).toBeNull()
		expect(fetchMock).toHaveBeenCalledTimes(1)

		await buttonByText(wrapper, 'Review the kept report').trigger('click')
		await flushPromises()
		expect(consentStatus()).toBe('Sent')
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
})
