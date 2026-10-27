import { describe, expect, it } from 'vitest'
import * as api from '../src/index.js'
import { formatLine } from '../src/core/errorBuffer.js'
import { maskText } from '../src/core/mask.js'
import { buildManifest } from '../src/core/manifest.js'
import { dropFileName } from '../src/core/filename.js'
import { buildZip, fingerprint } from '../src/core/zip.js'

// Skeleton smoke test: the public surface exists. Each module's issue replaces its part with real tests.
describe('skeleton', () => {
	it('exports the public API', () => {
		expect(typeof api.installErrorBuffer).toBe('function')
		expect(typeof api.buildReport).toBe('function')
		expect(typeof api.sendReport).toBe('function')
		expect(api.MAX_SCREENSHOT_BYTES).toBe(8 * 1024 * 1024)
		expect(api.ReportButton).toBeTruthy()
		expect(api.ReportForm).toBeTruthy()
		expect(api.ConsentScreen).toBeTruthy()
	})

	it('core modules exist', () => {
		for (const fn of [formatLine, maskText, buildManifest, dropFileName, buildZip, fingerprint]) {
			expect(typeof fn).toBe('function')
		}
	})
})
