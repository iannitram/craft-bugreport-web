// Flight recorder (1.1, M12-M13): the last 60 seconds of what the user did. See docs/code-map.md.
import { NotBuilt } from './notBuilt.js'

export function createTimeline({ windowMs = 60000, max = 100 } = {}) {
	const events = []
	
	return {
		add(event) {
			if (event === null || event === undefined) return
			
			events.push(event)
			
			// Keep only the newest max events
			if (events.length > max) {
				events.shift()
			}
		},
		
		events(now) {
			const cutoff = now.getTime() - windowMs
			// Filter events within the time window and return a copy
			return events.filter(event => Date.parse(event.t) >= cutoff).slice()
		},
		
		clear() {
			events.length = 0
		}
	}
}

export function maskPath(...args) {
	throw new NotBuilt('maskPath', ...args)
}

export function clickLabel(...args) {
	throw new NotBuilt('clickLabel', ...args)
}

export function formatEvent(...args) {
	throw new NotBuilt('formatEvent', ...args)
}

export function installRecorder(...args) {
	throw new NotBuilt('installRecorder', ...args)
}

export function markEvent(...args) {
	throw new NotBuilt('markEvent', ...args)
}
