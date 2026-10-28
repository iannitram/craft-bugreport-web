// manifest.json (M3), same fields as the desktop launcher plus nextcloud and browser.

function getOs(userAgent) {
	if (userAgent.includes('Windows')) {
		return 'windows'
	}
	if (userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')) {
		return 'macos'
	}
	if (userAgent.includes('Linux') && !userAgent.includes('Android')) {
		return 'linux'
	}
	return 'unknown'
}

function getArch(userAgent) {
	if (/arm64|aarch64/i.test(userAgent)) {
		return 'arm64'
	}
	if (/x86_64|Win64|x64/i.test(userAgent)) {
		return 'x86_64'
	}
	return 'unknown'
}

function getBrowser(userAgent) {
	const edge = userAgent.match(/Edg\/(\d+)/)
	if (edge) {
		return `Edge ${edge[1]}`
	}

	const firefox = userAgent.match(/Firefox\/(\d+)/)
	if (firefox) {
		return `Firefox ${firefox[1]}`
	}

	const chrome = userAgent.match(/Chrome\/(\d+)/)
	if (chrome) {
		return `Chrome ${chrome[1]}`
	}

	const safari = userAgent.match(/Version\/(\d+)(?:\.\d+)*.*Safari\//)
	if (safari) {
		return `Safari ${safari[1]}`
	}

	return 'unknown'
}

/**
 * @param {object} input see docs/code-map.md
 * @return {object} the manifest object (JSON-serialisable)
 */
export function buildManifest(input) {
	const { config, files, workingFileIncluded, screenshotIncluded, sentAsIs = [], now, userAgent } = input
	const agent = userAgent ?? ''

	return {
		kind: 'manual',
		app: config.app,
		version: config.version ?? '',
		commit: config.commit ?? '',
		os: getOs(agent),
		arch: getArch(agent),
		exit: null,
		signature: null,
		created: now.toISOString(),
		files: [...files],
		working_file_included: !!workingFileIncluded,
		screenshot_included: !!screenshotIncluded,
		names_masked: true,
		sent_as_is: [...sentAsIs],
		nextcloud: config.ncVersion ?? '',
		browser: getBrowser(agent),
	}
}
