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

describe('maskText', () => {
	it('turns /home/<name> into ~', () => {
		expect(maskText('open /home/alex/docs/a.opml failed', deepFreeze({}))).toBe('open ~/docs/a.opml failed')
	})

	it('turns /Users/<name> into ~', () => {
		expect(maskText('at /Users/sam/x.js', deepFreeze({}))).toBe('at ~/x.js')
	})

	it('turns Windows user folders into ~ for any drive, slash direction and case', () => {
		expect(maskText('D:/users/Kim/AppData/x', deepFreeze({}))).toBe('~/AppData/x')
		expect(maskText('C:\\Users\\Kim\\x', deepFreeze({}))).toBe('~\\x')
	})

	it('replaces the user name as a case-insensitive whole word', () => {
		expect(maskText('Alex saved; alexander left; ALEX', deepFreeze({ userName: 'alex' })))
			.toBe('<user> saved; alexander left; <user>')
	})

	it('escapes regex characters in the user name', () => {
		expect(maskText('a.b (c) user', deepFreeze({ userName: 'a.b (c)' }))).toBe('<user> user')
	})

	it('leaves text without matches alone and turns null/undefined into an empty string', () => {
		expect(maskText('nothing here', deepFreeze({ userName: '' }))).toBe('nothing here')
		expect(maskText(undefined, deepFreeze({}))).toBe('')
	})
})
