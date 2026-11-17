import { unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { buildManifest } from '../src/core/manifest.js'
import { buildReport } from '../src/core/report.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

const dec = new TextDecoder()
const CONFIG = { app: 'Outliner', version: '0.3.0', commit: 'abc1234', ncVersion: '33.0.10', userName: 'alex' }
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0'
const EVENT = { t: '2026-10-26T20:59:58.000Z', kind: 'click', role: 'button', label: 'Save' }

function run(overrides = {}) {
	return buildReport({
		config: CONFIG,
		whatHappened: 'it failed',
		expected: 'it works',
		errorLines: [],
		now: new Date('2026-10-26T21:00:00Z'),
		userAgent: UA,
		...overrides,
	})
}

const names = (report) => report.files.map((file) => file.name)
const timeline = (report) => JSON.parse(dec.decode(report.files.find((file) => file.name === 'timeline.json').data))

describe('buildReport timeline.json', () => {
	it('adds nothing when there are no events and no host', async () => {
		const report = await run({ timelineEvents: [], getDiagnostics: () => null })
		expect(names(report)).toEqual(['what-happened.txt', 'app.log', 'manifest.json'])
		expect(report.manifest.files).toEqual(['what-happened.txt', 'app.log', 'manifest.json'])
		expect(report.manifest.timeline_included).toBe(false)
		expect(names(await run())).toEqual(['what-happened.txt', 'app.log', 'manifest.json'])
	})

	it('places timeline.json after app.log in files, manifest and zip, and does not send it as is', async () => {
		const report = await run({
			timelineEvents: deepFreeze([{ ...EVENT }]),
			screenshot: { data: new Uint8Array([1, 2]), name: 's.png' },
		})
		const order = ['what-happened.txt', 'app.log', 'timeline.json', 'manifest.json', 'screenshot.png']
		expect(names(report)).toEqual(order)
		expect(report.manifest.files).toEqual(order)
		expect(report.manifest.timeline_included).toBe(true)
		expect(report.manifest.sent_as_is).toEqual(['screenshot.png'])
		expect(report.files.find((file) => file.name === 'timeline.json').sentAsIs).toBe(false)
		expect(Object.keys(unzipSync(report.zip))).toContain('timeline.json')
	})

	it('writes the text with window_seconds, the events and a null host', async () => {
		const report = await run({ timelineEvents: deepFreeze([{ ...EVENT }]) })
		const text = dec.decode(report.files.find((file) => file.name === 'timeline.json').data)
		expect(text).toBe(JSON.stringify({ window_seconds: 60, events: [EVENT], host: null }, null, 2))
	})

	it('accepts a function for timelineEvents', async () => {
		const timelineEvents = vi.fn(() => [{ ...EVENT }])
		expect(timeline(await run({ timelineEvents })).events).toEqual([EVENT])
		expect(timelineEvents).toHaveBeenCalledTimes(1)
	})

	it('masks only message, label and name of an event with maskLogLine', async () => {
		const events = deepFreeze([{
			t: EVENT.t,
			kind: 'error',
			role: 'button',
			method: 'GET',
			status: 200,
			path: '/apps/outliner/api/outline/42',
			label: 'alex saved',
			message: 'alex failed at /home/alex/a.opml',
			name: 'alex plan',
			other: 'alex',
		}])
		const [event] = timeline(await run({ timelineEvents: events })).events
		expect(event).toEqual({
			t: EVENT.t,
			kind: 'error',
			role: 'button',
			method: 'GET',
			status: 200,
			path: '/apps/outliner/api/outline/42',
			label: '<user> saved',
			message: '<user> failed at ~/a.opml',
			name: '<user> plan',
			other: 'alex',
		})
	})
})

describe('buildReport host diagnostics', () => {
	it('awaits getDiagnostics and masks every string of the result deeply', async () => {
		const getDiagnostics = vi.fn(async () => deepFreeze({ user: 'alex', n: 1, ok: true, no: null, items: ['alex', { deep: 'ok alex' }] }))
		const parsed = timeline(await run({ getDiagnostics }))
		expect(parsed).toEqual({ window_seconds: 60, events: [], host: { user: '<user>', n: 1, ok: true, no: null, items: ['<user>', { deep: 'ok <user>' }] } })
		expect(getDiagnostics).toHaveBeenCalledTimes(1)
	})

	it('uses an error marker when getDiagnostics throws or rejects', async () => {
		const marker = { error: 'getDiagnostics failed' }
		const thrower = () => {
			throw new Error('x')
		}
		expect(timeline(await run({ getDiagnostics: thrower })).host).toEqual(marker)
		expect(timeline(await run({ getDiagnostics: () => Promise.reject(new Error('x')) })).host).toEqual(marker)
	})

	it('truncates a result longer than 16384 characters, and keeps one of exactly 16384', async () => {
		const big = { blob: 'x'.repeat(16374) }
		expect(JSON.stringify(big)).toHaveLength(16385)
		expect(timeline(await run({ getDiagnostics: () => big })).host).toEqual({ truncated: true })
		const fits = { blob: 'x'.repeat(16373) }
		expect(JSON.stringify(fits)).toHaveLength(16384)
		expect(timeline(await run({ getDiagnostics: () => fits })).host).toEqual(fits)
	})

	it('adds timeline.json for host alone, and for events with host null', async () => {
		const hostOnly = await run({ getDiagnostics: () => ({ a: 1 }) })
		expect(names(hostOnly)).toContain('timeline.json')
		expect(hostOnly.manifest.timeline_included).toBe(true)
		const eventsOnly = await run({ timelineEvents: [EVENT], getDiagnostics: () => undefined })
		expect(timeline(eventsOnly).host).toBeNull()
	})

	it('treats a getDiagnostics that is not a function as no host', async () => {
		expect(names(await run({ getDiagnostics: { a: 1 } }))).not.toContain('timeline.json')
	})
})

describe('buildManifest timeline_included', () => {
	const base = { config: CONFIG, files: ['manifest.json'], sentAsIs: [], now: new Date('2026-10-26T21:00:00Z'), userAgent: UA }

	it('writes timeline_included as the last key, false by default', () => {
		expect(Object.keys(buildManifest(deepFreeze({ ...base, timelineIncluded: true }))).at(-1)).toBe('timeline_included')
		expect(buildManifest(deepFreeze({ ...base, timelineIncluded: true })).timeline_included).toBe(true)
		expect(buildManifest(deepFreeze({ ...base })).timeline_included).toBe(false)
	})
})
