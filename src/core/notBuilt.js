/**
 * Stub thrown by every function that is not built yet.
 */
export class NotBuilt extends Error {
	/**
	 * @param {string} name the function that is not built yet
	 * @param {...unknown} args the call's arguments (kept for the error message)
	 */
	constructor(name, ...args) {
		super(`not built yet: ${name} (${args.length} arguments)`)
		this.name = 'NotBuilt'
	}
}
