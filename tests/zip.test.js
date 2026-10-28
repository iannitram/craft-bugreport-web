import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildZip, fingerprint } from '../src/core/zip.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

const enc = new TextEncoder()

function entries() {
	return deepFreeze([
		{ name: 'what-happened.txt', data: enc.encode('a') },
		{ name: 'manifest.json', data: enc.encode('{}') },
	])
}

describe('buildZip', () => {
	it('holds each entry at the top level, in order, and round-trips the contents', () => {
		const unzipped = unzipSync(buildZip(entries()))
		expect(Object.keys(unzipped)).toEqual(['what-happened.txt', 'manifest.json'])
		expect(new TextDecoder().decode(unzipped['what-happened.txt'])).toBe('a')
		expect(new TextDecoder().decode(unzipped['manifest.json'])).toBe('{}')
	})

	it('gives byte-identical output for the same entries', () => {
		expect(Array.from(buildZip(entries()))).toEqual(Array.from(buildZip(entries())))
	})

	it('throws TypeError on a duplicate name', () => {
		const dup = deepFreeze([
			{ name: 'a.txt', data: enc.encode('1') },
			{ name: 'a.txt', data: enc.encode('2') },
		])
		expect(() => buildZip(dup)).toThrow(TypeError)
		expect(() => buildZip(dup)).toThrow('duplicate entry: a.txt')
	})

	it('throws TypeError on a name containing ..', () => {
		const bad = deepFreeze([{ name: '../x', data: enc.encode('1') }])
		expect(() => buildZip(bad)).toThrow(TypeError)
		expect(() => buildZip(bad)).toThrow('bad entry name: ../x')
	})
})

describe('fingerprint', () => {
	it('returns the lowercase hex SHA-256', async () => {
		expect(await fingerprint(enc.encode('abc')))
			.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
	})

	it('changes when one byte of the zip changes', async () => {
		const zip = buildZip(entries())
		const changed = zip.slice()
		changed[changed.length - 1] ^= 1
		const before = await fingerprint(zip)
		const after = await fingerprint(changed)
		expect(before).toMatch(/^[0-9a-f]{64}$/)
		expect(after).not.toBe(before)
	})
})
