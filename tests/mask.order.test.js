import { describe, expect, it } from 'vitest'
import { maskText } from '../src/core/mask.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

describe('maskText rule order', () => {
	it('applies the Windows home rule before the /Users rule, so the drive letter goes too', () => {
		expect(maskText('C:/Users/Kim/x', deepFreeze({}))).toBe('~/x')
	})

	it('removes the drive letter from a file URL with a forward-slash Windows path', () => {
		expect(maskText('file:///C:/Users/Kim/app.js', deepFreeze({}))).toBe('file:///~/app.js')
	})
})
