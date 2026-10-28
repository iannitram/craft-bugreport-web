import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatLine, installErrorBuffer } from '../src/core/errorBuffer.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

const STAMP = '2026-10-26T21:00:00.000Z'

describe('formatLine', () => {
	it('joins the arguments after the ISO time and level', () => {
		const args = deepFreeze(['disk', 3, { a: 1 }])
		expect(formatLine('warn', args, new Date('2026-10-26T21:00:00Z')))
			.toBe('2026-10-26T21:00:00.000Z WARN disk 3 {"a":1}')
	})
})

describe('installErrorBuffer', () => {
	let buffer
	let errorSpy
	let warnSpy

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-10-26T21:00:00Z'))
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
		buffer = undefined
	})

	afterEach(() => {
		if (buffer) {
			buffer.uninstall()
		}
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it('records console.error and still calls the original', () => {
		buffer = installErrorBuffer()
		console.error('boom')
		expect(buffer.lines()).toEqual([`${STAMP} ERROR boom`])
		expect(errorSpy).toHaveBeenCalledWith('boom')
	})

	it('keeps only the last size lines, oldest first', () => {
		buffer = installErrorBuffer({ size: 2 })
		console.warn('one')
		console.warn('two')
		console.warn('three')
		expect(buffer.lines()).toEqual([`${STAMP} WARN two`, `${STAMP} WARN three`])
		expect(warnSpy).toHaveBeenCalledTimes(3)
	})

	it('records window error events', () => {
		buffer = installErrorBuffer()
		window.dispatchEvent(new ErrorEvent('error', { message: 'x', filename: 'a.js', lineno: 3 }))
		const lines = buffer.lines()
		expect(lines).toHaveLength(1)
		expect(lines[0].endsWith('ERROR x at a.js:3')).toBe(true)
	})

	it('restores console.error on uninstall and stops recording', () => {
		const wrapped = installErrorBuffer()
		expect(console.error).not.toBe(errorSpy)
		wrapped.uninstall()
		expect(console.error).toBe(errorSpy)
		console.error('late')
		expect(wrapped.lines()).toEqual([])
	})
})
