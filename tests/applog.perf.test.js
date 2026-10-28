import { describe, expect, it } from 'vitest'
import { maskLogLine } from '../src/core/report.js'

// #32 review: the app.log masking patterns must stay linear. Before the fix a 10 KB line of
// 'key-' repeated took about 24 s (cubic key=value pattern); the URL, file-name and long
// opaque string patterns were quadratic. 200 KB of each bad input must mask quickly.
const SIZE = 200 * 1024
const repeatTo = (unit) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE)
const BAD_INPUTS = {
	'key- (key=value)': repeatTo('key-'),
	'key. (key=value)': repeatTo('key.'),
	'key= (key=value)': repeatTo('key='),
	'a- (opaque)': repeatTo('a-'),
	'a= (opaque)': repeatTo('a='),
	'x (opaque)': repeatTo('x'),
	'a+ (url scheme)': repeatTo('a+'),
	'-. (file name)': repeatTo('-.'),
	'a. (file name)': repeatTo('a.'),
	'a@ (e-mail)': repeatTo('a@'),
	'/ (path)': repeatTo('/'),
}

describe('app.log masking runs in linear time (#32)', () => {
	for (const [name, input] of Object.entries(BAD_INPUTS)) {
		it(`masks 200 KB of ${name} in under 1 s`, () => {
			const start = performance.now()
			maskLogLine(input)
			expect(performance.now() - start).toBeLessThan(1000)
		})
	}

	it('still masks the canaries after the rewrite', () => {
		const line = 'password: hunter2 secret="s3" "token":"abc" api_key=K1 note=x a.authToken=Z open CANARY_FILE_32.opml at https://h/x?q=1'
		const masked = maskLogLine(line)
		for (const secret of ['hunter2', 's3', 'abc', 'K1', 'Z', 'CANARY_FILE_32', 'q=1']) {
			expect(masked).not.toContain(secret)
		}
		expect(masked).toContain('note=x')
	})
})
