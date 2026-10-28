/* eslint-disable no-console */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

const RULES = [
	{ id: '(a)', pattern: /\.ts\.net\b/i },
	{ id: '(b)', pattern: /public\.php\/dav\/files\/(?!FAKETOKEN|<token>|<dropToken>|\$\{)[A-Za-z0-9]{10,}/ },
]

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
	.split('\n')
	.filter(Boolean)

let hasSecrets = false

for (const file of files) {
	if (file === 'package-lock.json') {
		continue
	}
	if (!fs.existsSync(file)) {
		continue
	}
	const stat = fs.statSync(file)
	if (!stat.isFile()) {
		continue
	}
	const buf = fs.readFileSync(file)
	if (buf.subarray(0, 8000).includes(0)) {
		continue
	}
	const lines = buf.toString('utf8').split(/\r?\n/)
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		for (const rule of RULES) {
			if (rule.pattern.test(line)) {
				console.log(`${file}:${i + 1}: ${rule.id}`)
				hasSecrets = true
			}
		}
	}
}

if (hasSecrets) {
	process.exit(1)
}

console.log('no drop secrets found')
