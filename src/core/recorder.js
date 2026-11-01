// Flight recorder (1.1, M12-M13): the last 60 seconds of what the user did. See docs/code-map.md.
import { NotBuilt } from './notBuilt.js'

export function createTimeline(...args) {
	throw new NotBuilt('createTimeline', ...args)
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
