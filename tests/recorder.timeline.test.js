import { describe, expect, it } from 'vitest'
import { createTimeline } from '../src/core/recorder.js'

function deepFreeze(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Reflect.ownKeys(value)) {
			deepFreeze(value[key])
		}
	}
	return value
}

const at = (time, extra = {}) => deepFreeze({ t: `2026-10-26T${time}.000Z`, kind: 'mark', ...extra })
const now = (time) => new Date(`2026-10-26T${time}.000Z`)

describe('createTimeline', () => {
	it('keeps only the events of the last 60 seconds by default', () => {
		const timeline = createTimeline()
		const events = [at('10:00:00'), at('10:00:30'), at('10:01:10')]
		events.forEach((event) => timeline.add(event))
		expect(timeline.events(now('10:01:20'))).toEqual([events[1], events[2]])
	})

	it('keeps an event that is exactly windowMs old', () => {
		const timeline = createTimeline()
		timeline.add(at('10:00:20'))
		timeline.add(at('10:00:19'))
		expect(timeline.events(now('10:01:20')).map((event) => event.t)).toEqual(['2026-10-26T10:00:20.000Z'])
	})

	it('uses a custom windowMs', () => {
		const timeline = createTimeline({ windowMs: 5000 })
		timeline.add(at('10:00:00'))
		timeline.add(at('10:00:06'))
		expect(timeline.events(now('10:00:10'))).toEqual([at('10:00:06')])
	})

	it('keeps the newest max events', () => {
		const timeline = createTimeline({ max: 3 })
		const events = ['10:00:01', '10:00:02', '10:00:03', '10:00:04', '10:00:05'].map((time) => at(time))
		events.forEach((event) => timeline.add(event))
		expect(timeline.events(now('10:00:06'))).toEqual(events.slice(2))
	})

	it('defaults max to 100', () => {
		const timeline = createTimeline()
		for (let i = 0; i < 105; i++) {
			timeline.add(at('10:00:00', { n: i }))
		}
		const result = timeline.events(now('10:00:01'))
		expect(result).toHaveLength(100)
		expect(result[0].n).toBe(5)
		expect(result[99].n).toBe(104)
	})

	it('returns events in the order they were added', () => {
		const timeline = createTimeline()
		const later = at('10:00:09', { n: 1 })
		const earlier = at('10:00:01', { n: 2 })
		timeline.add(later)
		timeline.add(earlier)
		expect(timeline.events(now('10:00:10'))).toEqual([later, earlier])
	})

	it('ignores null and undefined', () => {
		const timeline = createTimeline()
		timeline.add(null)
		timeline.add(undefined)
		expect(timeline.events(now('10:00:10'))).toEqual([])
		timeline.add(at('10:00:09'))
		timeline.add(null)
		expect(timeline.events(now('10:00:10'))).toHaveLength(1)
	})

	it('returns a copy that cannot change the stored events', () => {
		const timeline = createTimeline()
		timeline.add(at('10:00:09'))
		const first = timeline.events(now('10:00:10'))
		first.pop()
		first.push({ t: 'x' })
		expect(timeline.events(now('10:00:10'))).toEqual([at('10:00:09')])
		expect(timeline.events(now('10:00:10'))).not.toBe(timeline.events(now('10:00:10')))
	})

	it('clear forgets every event', () => {
		const timeline = createTimeline()
		timeline.add(at('10:00:08'))
		timeline.add(at('10:00:09'))
		timeline.clear()
		expect(timeline.events(now('10:00:10'))).toEqual([])
		timeline.add(at('10:00:09'))
		expect(timeline.events(now('10:00:10'))).toHaveLength(1)
	})

	it('never shares events between two timelines', () => {
		const one = createTimeline()
		const two = createTimeline()
		one.add(at('10:00:09'))
		expect(two.events(now('10:00:10'))).toEqual([])
		two.add(at('10:00:08'))
		one.clear()
		expect(two.events(now('10:00:10'))).toEqual([at('10:00:08')])
	})
})