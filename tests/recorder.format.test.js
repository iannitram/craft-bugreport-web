import { beforeEach, describe, expect, it } from 'vitest'
import { clickLabel, formatEvent, maskPath } from '../src/core/recorder.js'

const DATE = new Date('2026-10-26T21:00:00.123Z')
const T = '2026-10-26T21:00:00.123Z'

function el(html, selector) {
	document.body.innerHTML = html
	return document.body.querySelector(selector)
}

describe('maskPath', () => {
	it('keeps plain parts and drops query and hash', () => {
		expect(maskPath('/apps/outliner/api/outline/42?token=abc#x', 'ian')).toBe('/apps/outliner/api/outline/42')
	})

	it('masks file names and the user name, and uses only the pathname of a full URL', () => {
		expect(maskPath('https://h.test/remote.php/dav/files/ian/Notes/plan.opml', 'ian'))
			.toBe('/<file>/dav/files/<user>/Notes/<file>')
	})

	it('keeps 6 parts and adds an ellipsis only when there were more', () => {
		expect(maskPath('/a/b/c/d/e/f/g/h', '')).toBe('/a/b/c/d/e/f/…')
		expect(maskPath('/a/b/c/d/e/f', '')).toBe('/a/b/c/d/e/f')
	})

	it('masks parts of 24 or more characters as <id>', () => {
		expect(maskPath('/x/0123456789abcdef01234567', '')).toBe('/x/<id>')
		expect(maskPath('/x/0123456789abcdef0123456', '')).toBe('/x/0123456789abcdef0123456')
	})

	it('applies the first matching rule: user name, then file, then id', () => {
		expect(maskPath('/u/ian.b', 'ian.b')).toBe('/u/<user>')
		expect(maskPath(`/u/${'a'.repeat(30)}.js`, '')).toBe('/u/<file>')
	})

	it('decodes each part before matching, and keeps the raw part when decoding fails', () => {
		expect(maskPath('/a/%69an/b', 'ian')).toBe('/a/<user>/b')
		expect(maskPath('/a/%E0%A4%A', '')).toBe('/a/%E0%A4%A')
	})

	it('returns / when there are no parts, <url> when the URL cannot be parsed', () => {
		expect(maskPath('/', '')).toBe('/')
		expect(maskPath('http://', 'ian')).toBe('<url>')
	})
})

describe('clickLabel', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
	})

	it('treats inputs, editable and private elements, and their descendants, as private', () => {
		const private_ = { role: 'private', label: '<private>' }
		expect(clickLabel(el('<input value="secret">', 'input'), 'ian')).toEqual(private_)
		expect(clickLabel(el('<textarea></textarea>', 'textarea'), 'ian')).toEqual(private_)
		expect(clickLabel(el('<select><option>a</option></select>', 'option'), 'ian')).toEqual(private_)
		expect(clickLabel(el('<div contenteditable="true"><b>x</b></div>', 'b'), 'ian')).toEqual(private_)
		expect(clickLabel(el('<div contenteditable=""><b>x</b></div>', 'b'), 'ian')).toEqual(private_)
		expect(clickLabel(el('<div data-bugreport-private><button>Pay</button></div>', 'button'), 'ian')).toEqual(private_)
		expect(clickLabel(el('<button><input></button>', 'input'), 'ian')).toEqual(private_)
	})

	it('returns null when nothing clickable is at or above the element', () => {
		expect(clickLabel(el('<div><span>hi</span></div>', 'span'), 'ian')).toBeNull()
	})

	it('finds the clickable ancestor and gives button, link and summary their roles', () => {
		expect(clickLabel(el('<button><span>Save</span></button>', 'span'), 'ian')).toEqual({ role: 'button', label: 'Save' })
		expect(clickLabel(el('<a href="/x">Open</a>', 'a'), 'ian')).toEqual({ role: 'link', label: 'Open' })
		expect(clickLabel(el('<details><summary>More</summary></details>', 'summary'), 'ian')).toEqual({ role: 'button', label: 'More' })
	})

	it('prefers the role attribute', () => {
		expect(clickLabel(el('<div role="tab">Files</div>', 'div'), 'ian')).toEqual({ role: 'tab', label: 'Files' })
		expect(clickLabel(el('<a href="/x" role="menuitem">Go</a>', 'a'), 'ian')).toEqual({ role: 'menuitem', label: 'Go' })
	})

	it('takes the label from aria-label, then title, then text', () => {
		expect(clickLabel(el('<button aria-label="A" title="T">X</button>', 'button'), 'ian').label).toBe('A')
		expect(clickLabel(el('<button title="T">X</button>', 'button'), 'ian').label).toBe('T')
		expect(clickLabel(el('<button aria-label="" title="">X</button>', 'button'), 'ian').label).toBe('X')
	})

	it('collapses whitespace, masks the user name and the home path', () => {
		expect(clickLabel(el('<button>  Open \n  ian  in\t/home/ian/x </button>', 'button'), 'ian').label).toBe('Open <user> in ~/x')
	})

	it('masks first, then cuts to 40 characters', () => {
		const html = `<button>${'y'.repeat(35)} ian</button>`
		expect(clickLabel(el(html, 'button'), 'ian').label).toBe(`${'y'.repeat(35)} <use`)
	})

	it('gives an empty label as <no label>', () => {
		expect(clickLabel(el('<button>  </button>', 'button'), 'ian')).toEqual({ role: 'button', label: '<no label>' })
	})
})

describe('formatEvent', () => {
	it('formats a route', () => {
		expect(formatEvent('route', Object.freeze({ url: '/apps/x/42?q=1' }), DATE, 'ian')).toEqual({ t: T, kind: 'route', path: '/apps/x/42' })
	})

	it('formats a click, or gives null when clickLabel does', () => {
		const button = el('<button>Save</button>', 'button')
		expect(formatEvent('click', Object.freeze({ element: button }), DATE, 'ian')).toEqual({ t: T, kind: 'click', role: 'button', label: 'Save' })
		const div = el('<div>x</div>', 'div')
		expect(formatEvent('click', Object.freeze({ element: div }), DATE, 'ian')).toBeNull()
	})

	it('formats a request: upper-case method, GET default, masked path, numeric status', () => {
		const detail = Object.freeze({ method: 'post', url: '/a/ian/b.txt?x=1', status: '201' })
		expect(formatEvent('request', detail, DATE, 'ian')).toEqual({ t: T, kind: 'request', method: 'POST', path: '/a/<user>/<file>', status: 201 })
		expect(formatEvent('request', Object.freeze({ url: '/a', status: 'abc' }), DATE, '')).toEqual({ t: T, kind: 'request', method: 'GET', path: '/a', status: 0 })
		expect(formatEvent('request', Object.freeze({ url: '/a' }), DATE, '').status).toBe(0)
	})

	it('formats an error with maskLogLine and cuts it to 120 characters', () => {
		const detail = Object.freeze({ message: 'ian failed at /home/ian/a.opml' })
		expect(formatEvent('error', detail, DATE, 'ian')).toEqual({ t: T, kind: 'error', message: '<user> failed at ~/a.opml' })
		expect(formatEvent('error', Object.freeze({ message: 'e'.repeat(200) }), DATE, '').message).toBe('e'.repeat(120))
		expect(formatEvent('error', Object.freeze({}), DATE, '').message).toBe('')
	})

	it('formats a mark with maskText and cuts it to 40 characters', () => {
		expect(formatEvent('mark', Object.freeze({ name: 'ian plan' }), DATE, 'ian')).toEqual({ t: T, kind: 'mark', name: '<user> plan' })
		expect(formatEvent('mark', Object.freeze({ name: 'n'.repeat(50) }), DATE, '').name).toBe('n'.repeat(40))
		expect(formatEvent('mark', Object.freeze({}), DATE, '').name).toBe('')
	})

	it('gives null for any other kind', () => {
		expect(formatEvent('scroll', Object.freeze({}), DATE, 'ian')).toBeNull()
	})
})
