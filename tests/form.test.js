import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReportButton from '../src/components/ReportButton.vue'
import ReportForm from '../src/components/ReportForm.vue'
import { buildReport } from '../src/core/report.js'

vi.mock('../src/core/report.js', () => ({
	buildReport: vi.fn(async () => ({ files: [], zip: new Uint8Array(), fingerprint: 'fake', manifest: {} })),
	MAX_SCREENSHOT_BYTES: 8 * 1024 * 1024,
}))

const NINE_MB = 9 * 1024 * 1024
const config = { app: 'Test app', version: '1.0.0', dropBase: 'https://drop.example.test', dropToken: 'fake-token' }

let wrappers = []

function mountButton(props = {}) {
	const wrapper = mount(ReportButton, {
		props: { config, ...props },
		attachTo: document.body,
	})
	wrappers.push(wrapper)
	return wrapper
}

function dialog() {
	return document.querySelector('[role="dialog"]')
}

function buttonByText(wrapper, text) {
	return wrapper.findAll('button').find((button) => button.text() === text)
}

async function openForm(wrapper) {
	await wrapper.find('button').trigger('click')
	await flushPromises()
	return wrapper
}

function whatHappenedField(wrapper) {
	return wrapper.find('textarea')
}

// jsdom cannot set input.files, so define it on the element.
function chooseFile(wrapper, file) {
	const input = wrapper.find('input[type="file"]')
	Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
	return input.trigger('change')
}

function fakeFile(name, type) {
	return new File([new Uint8Array([1, 2, 3, 4])], name, { type })
}

// A file whose reported size is over the limit, without allocating 9 MB.
function bigFile(name, type, size) {
	const file = fakeFile(name, type)
	Object.defineProperty(file, 'size', { value: size })
	return file
}

beforeEach(() => {
	vi.clearAllMocks()
})

afterEach(() => {
	for (const wrapper of wrappers) {
		wrapper.unmount()
	}
	wrappers = []
	document.body.innerHTML = ''
})

describe('ReportButton and ReportForm', () => {
	it('the button opens the form and focus lands on "What happened?"', async () => {
		const wrapper = mountButton()
		expect(dialog()).toBeNull()

		await openForm(wrapper)

		expect(dialog()).not.toBeNull()
		expect(dialog().getAttribute('aria-modal')).toBe('true')
		const labelledBy = dialog().getAttribute('aria-labelledby')
		expect(document.getElementById(labelledBy).textContent.trim()).toBe('Report a bug')
		expect(document.activeElement).toBe(whatHappenedField(wrapper).element)
	})

	it('"Make the report" is disabled until "What happened?" has text', async () => {
		const wrapper = await openForm(mountButton())
		const make = () => buttonByText(wrapper, 'Make the report')

		expect(make().element.disabled).toBe(true)

		await whatHappenedField(wrapper).setValue('   ')
		expect(make().element.disabled).toBe(true)

		await whatHappenedField(wrapper).setValue('The page froze')
		expect(make().element.disabled).toBe(false)
	})

	it('a 9 MB file shows the size message and is not attached', async () => {
		const wrapper = await openForm(mountButton())

		await chooseFile(wrapper, bigFile('big.png', 'image/png', NINE_MB))

		const alert = wrapper.find('[role="alert"]')
		expect(alert.exists()).toBe(true)
		expect(alert.text()).toContain('8 MB')
		const picker = wrapper.find('button[aria-label^="Choose image"]')
		expect(picker.attributes('aria-describedby')).toContain(alert.attributes('id'))

		await whatHappenedField(wrapper).setValue('Broken')
		await buttonByText(wrapper, 'Make the report').trigger('click')
		await flushPromises()

		expect(buildReport).toHaveBeenCalledTimes(1)
		expect(buildReport.mock.calls[0][0].screenshot).toBeNull()
	})

	it('the working-file box is unticked each time the form opens', async () => {
		const getWorkingFile = vi.fn(async () => null)
		const wrapper = mountButton({ getWorkingFile })

		await openForm(wrapper)
		const box = () => wrapper.find('input[type="checkbox"]')
		await box().setValue(true)
		expect(box().element.checked).toBe(true)

		await buttonByText(wrapper, 'Cancel').trigger('click')
		await flushPromises()
		await openForm(wrapper)

		expect(box().element.checked).toBe(false)
	})

	it('the working-file box is not shown when getWorkingFile is not passed', async () => {
		const wrapper = await openForm(mountButton())

		expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
	})

	it('Escape closes the form without building a report', async () => {
		const wrapper = await openForm(mountButton())
		await whatHappenedField(wrapper).setValue('Broken')

		await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
		await flushPromises()

		expect(dialog()).toBeNull()
		expect(buildReport).not.toHaveBeenCalled()
	})

	it('Cancel closes the form without building a report', async () => {
		const wrapper = await openForm(mountButton())
		await whatHappenedField(wrapper).setValue('Broken')

		await buttonByText(wrapper, 'Cancel').trigger('click')
		await flushPromises()

		expect(dialog()).toBeNull()
		expect(buildReport).not.toHaveBeenCalled()
	})

	it('Tab from the last control wraps to the first inside the dialog', async () => {
		const wrapper = await openForm(mountButton())
		const cancel = buttonByText(wrapper, 'Cancel')
		cancel.element.focus()

		await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Tab' })

		expect(document.activeElement).toBe(whatHappenedField(wrapper).element)
	})

	it('"Make the report" with valid input calls buildReport once with the form values', async () => {
		const getWorkingFile = vi.fn(async () => ({ name: 'outline.opml', data: new Uint8Array([1]) }))
		const wrapper = await openForm(mountButton({ getWorkingFile }))
		const screenshot = fakeFile('shot.png', 'image/png')

		await whatHappenedField(wrapper).setValue('The page froze')
		await wrapper.findAll('textarea')[1].setValue('It should load')
		await chooseFile(wrapper, screenshot)
		await wrapper.find('input[type="checkbox"]').setValue(true)
		await buttonByText(wrapper, 'Make the report').trigger('click')
		await flushPromises()

		expect(buildReport).toHaveBeenCalledTimes(1)
		expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
			config,
			whatHappened: 'The page froze',
			expected: 'It should load',
			screenshot,
			includeWorkingFile: true,
			getWorkingFile,
		}))
		// The form closes once the report is built (the consent screen, #10, is the next dialog).
		expect(wrapper.findComponent(ReportForm).exists()).toBe(false)
	})
})

describe('ReportForm alone', () => {
	it('emits make-report with the built report', async () => {
		const wrapper = mount(ReportForm, { props: { config }, attachTo: document.body })
		wrappers.push(wrapper)

		await whatHappenedField(wrapper).setValue('Broken')
		await buttonByText(wrapper, 'Make the report').trigger('click')
		await flushPromises()

		expect(wrapper.emitted('makeReport')).toHaveLength(1)
	})
})
