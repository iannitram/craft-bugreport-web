import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installErrorBuffer, mountReportButton } from '../src/standalone.js'

const config = { app: 'Test app', version: '1.0.0', dropBase: 'https://drop.example.test', dropToken: 'fake-token' }

let host

beforeEach(() => {
	host = document.createElement('div')
	document.body.appendChild(host)
})

afterEach(() => {
	host.remove()
	vi.unstubAllGlobals()
})

describe('mountReportButton', () => {
	it('mounts the "Report a bug" button into the element', () => {
		const handle = mountReportButton(host, { config })

		const button = host.querySelector('button')
		expect(button.textContent.trim()).toBe('Report a bug')

		handle.unmount()
	})

	it('clicking the button shows the form', async () => {
		const handle = mountReportButton(host, { config })

		host.querySelector('button').click()
		await flushPromises()

		expect(host.querySelector('[role="dialog"]')).not.toBeNull()
		expect(host.querySelector('textarea')).not.toBeNull()

		handle.unmount()
	})

	it('unmount() removes everything and leaves the element empty', async () => {
		const handle = mountReportButton(host, { config })
		host.querySelector('button').click()
		await flushPromises()

		handle.unmount()

		expect(host.innerHTML).toBe('')
		expect(host.querySelector('button')).toBeNull()
		expect(host.querySelector('[role="dialog"]')).toBeNull()
	})

	it('re-exports installErrorBuffer', () => {
		expect(typeof installErrorBuffer).toBe('function')
	})
})
