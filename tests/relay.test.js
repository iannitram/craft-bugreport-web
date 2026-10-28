import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import ConsentScreen from '../src/components/ConsentScreen.vue'
import ReportButton from '../src/components/ReportButton.vue'
import { isAllowedRelayUrl, relayProblem } from '../src/core/relay.js'
import { buildReport } from '../src/core/report.js'
import { buildZip, fingerprint } from '../src/core/zip.js'
import { mountReportButton } from '../src/standalone.js'

vi.mock('../src/core/report.js', () => ({
	buildReport: vi.fn(),
	MAX_SCREENSHOT_BYTES: 8 * 1024 * 1024,
}))

const CONFLICT = 'Use relayUrl or dropBase/dropToken, not both; a page must use relayUrl.'
const RELAY = '/apps/outliner/api/bug-report'
const relayConfig = { app: 'Outliner', version: '1.0.0', relayUrl: RELAY, headers: { requesttoken: 'TEST-TOKEN' } }

let wrappers = []
let host
let fixture
let fetchMock

beforeAll(async () => {
	const zip = buildZip([{ name: 'what-happened.txt', data: new TextEncoder().encode('What happened:\nThe page froze\n') }])
	fixture = { files: [], zip, fingerprint: await fingerprint(zip), manifest: {} }
})

beforeEach(() => {
	vi.clearAllMocks()
	buildReport.mockImplementation(async () => ({ ...fixture }))
	fetchMock = vi.fn(async () => ({ status: 201 }))
	vi.stubGlobal('fetch', fetchMock)
	host = document.createElement('div')
	document.body.appendChild(host)
})

afterEach(() => {
	for (const wrapper of wrappers) {
		wrapper.unmount()
	}
	wrappers = []
	host.remove()
	vi.unstubAllGlobals()
})

function mountButton(config) {
	const wrapper = mount(ReportButton, { props: { config }, attachTo: document.body })
	wrappers.push(wrapper)
	return wrapper
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

function consentDialogText() {
	return document.querySelector('[role="dialog"]').textContent
}

describe('relayProblem and isAllowedRelayUrl', () => {
	it('S2: a relayUrl with dropToken or dropBase is a conflict', () => {
		expect(relayProblem({ relayUrl: RELAY, dropToken: 'FAKETOKEN' })).toBe(CONFLICT)
		expect(relayProblem({ relayUrl: RELAY, dropBase: 'https://drop.example.test' })).toBe(CONFLICT)
	})

	it('no relayUrl means nothing to check here (direct drop is checked by sendReport)', () => {
		expect(relayProblem({ dropBase: 'https://drop.example.test', dropToken: 'FAKETOKEN' })).toBe('')
		expect(relayProblem({})).toBe('')
	})

	it('S4: same-origin relative paths and loopback http are allowed', () => {
		expect(isAllowedRelayUrl('/apps/x/api/bug-report')).toBe(true)
		expect(isAllowedRelayUrl('apps/x/api/bug-report')).toBe(true)
		expect(isAllowedRelayUrl('http://localhost:3000/apps/x')).toBe(true)
	})

	it('S4: other origins, protocol-relative URLs and non-loopback http are refused', () => {
		expect(isAllowedRelayUrl('https://drop.example.test/x')).toBe(false)
		expect(isAllowedRelayUrl('//drop.example.test/x')).toBe(false)
		expect(isAllowedRelayUrl('http://example.test/x')).toBe(false)
		expect(isAllowedRelayUrl('javascript:alert(1)')).toBe(false)
		expect(isAllowedRelayUrl('')).toBe(false)
		expect(isAllowedRelayUrl(42)).toBe(false)
	})
})

describe('config validation at mount (S2)', () => {
	it('mountReportButton throws the clear error and mounts nothing', () => {
		expect(() => mountReportButton(host, { config: { ...relayConfig, dropToken: 'FAKETOKEN' } })).toThrow(CONFLICT)
		expect(host.innerHTML).toBe('')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('ReportButton shows the error in place of the button, with no form to send from', () => {
		const wrapper = mountButton({ ...relayConfig, dropBase: 'https://drop.example.test' })
		expect(wrapper.find('[role="alert"]').text()).toBe(CONFLICT)
		expect(wrapper.find('button').exists()).toBe(false)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('ConsentScreen shows the conflict, leaves Send disabled, and never calls fetch', async () => {
		const wrapper = mount(ConsentScreen, {
			props: { report: fixture, config: { ...relayConfig, dropToken: 'FAKETOKEN' } },
			attachTo: document.body,
		})
		wrappers.push(wrapper)
		await flushPromises()
		expect(consentDialogText()).toContain(CONFLICT)
		expect(buttonByText(wrapper, 'Send').element.disabled).toBe(true)
		expect(fetchMock).not.toHaveBeenCalled()
	})
})

describe('relay mode end to end (S3)', () => {
	it('a successful relay send shows the success message in the form', async () => {
		const wrapper = mountButton(relayConfig)
		await makeReportThrough(wrapper)
		await buttonByText(wrapper, 'Send').trigger('click')
		await vi.waitFor(() => expect(consentDialogText()).toContain('Sent. Thank you.'))

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(RELAY)
		expect(init.method).toBe('POST')
		expect(init.headers).toEqual({ requesttoken: 'TEST-TOKEN' })
	})

	it.each([
		[401, 'You need to be signed in to send a report.'],
		[413, 'The report is too large to send.'],
	])('a %i shows its message in the form, and the response body and headers do not appear', async (status, message) => {
		const marker = 'MARKER-BODY-4412'
		fetchMock.mockImplementation(async () => ({
			status,
			headers: new Map([['x-debug', marker]]),
			text: async () => marker,
		}))
		const wrapper = mountButton(relayConfig)
		await makeReportThrough(wrapper)
		await buttonByText(wrapper, 'Send').trigger('click')
		await vi.waitFor(() => expect(consentDialogText()).toContain(message))

		expect(consentDialogText()).not.toContain(marker)
		expect(document.body.innerHTML).not.toContain(marker)
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})
})
