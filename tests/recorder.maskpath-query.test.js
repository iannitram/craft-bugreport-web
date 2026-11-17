import { describe, expect, it } from 'vitest'
import { maskPath } from '../src/core/recorder.js'

describe('maskPath encoded query delimiters', () => {
	it('masks an encoded question mark and token assignment', () => {
		expect(maskPath('/a/%3Ftoken%3Dabc', '')).toBe('/a/<id>')
		expect(maskPath('/a/%3F', '')).toBe('/a/<id>')
	})

	it('masks an encoded hash in a segment', () => {
		expect(maskPath('/a/section%23secret', '')).toBe('/a/<id>')
	})

	it('masks an encoded ampersand in a segment', () => {
		expect(maskPath('/a/name%26tail', '')).toBe('/a/<id>')
	})

	it('masks an encoded equals sign by itself', () => {
		expect(maskPath('/a/%3D', '')).toBe('/a/<id>')
	})

	it('drops a real query and hash while masking encoded delimiters', () => {
		const path = maskPath('https://example.test/a/%3Ftoken%3Dabc?real=query#real-hash', '')
		expect(path).toBe('/a/<id>')
		expect(path).not.toMatch(/[?#&=]/)
		expect(path).not.toContain('token')
	})
})
