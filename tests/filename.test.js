import { describe, expect, it } from 'vitest'
import { dropFileName } from '../src/core/filename.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

describe('dropFileName', () => {
	it('builds the name from app, UTC time and hex', () => {
		const now = deepFreeze(new Date('2026-10-26T21:05:09Z'))
		expect(dropFileName('Outliner', now, '0a1b2c3d')).toBe('Outliner-web-20261026T210509Z-0a1b2c3d.zip')
	})

	it('strips characters outside A-Za-z0-9 from the app and drops milliseconds', () => {
		expect(dropFileName('NC Projects!', new Date('2026-01-02T03:04:05.678Z'), 'deadbeef'))
			.toBe('NCProjects-web-20260102T030405Z-deadbeef.zip')
	})

	it('rejects a randomHex that is not 8 lowercase hex characters', () => {
		expect(() => dropFileName('Outliner', new Date(), 'XYZ')).toThrow(TypeError)
		expect(() => dropFileName('Outliner', new Date(), 'XYZ')).toThrow('randomHex must be 8 lowercase hex characters')
	})

	it('rejects an app that is empty after cleaning', () => {
		expect(() => dropFileName('!!', new Date(), '00000000')).toThrow(TypeError)
		expect(() => dropFileName('!!', new Date(), '00000000')).toThrow('app is empty')
	})
})
