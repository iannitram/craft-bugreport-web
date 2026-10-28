import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Reads the built standalone bundles. Runs only when BUNDLE_CHECK is set (CI's
// "Standalone bundle check" step, after the build); then the bundles must exist.
const root = resolve(import.meta.dirname, '..')
const esmPath = resolve(root, 'dist/craft-bugreport-web.standalone.js')
const iifePath = resolve(root, 'dist/craft-bugreport-web.standalone.iife.js')

// Every module specifier the file names in an import, export-from or dynamic import.
function specifiers(source) {
	const found = []
	const patterns = [
		/\bimport\s*(?:[\w$*{},\s]*\sfrom\s*)?["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
		/\bexport\s*(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g,
	]
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) {
			found.push(match[1])
		}
	}
	return found
}

// A bare specifier is anything that is not a relative, absolute or URL path.
function isBare(specifier) {
	return !/^(\.{0,2}\/|\/|https?:|data:|blob:)/.test(specifier)
}

describe.skipIf(!process.env.BUNDLE_CHECK)('standalone bundles', () => {
	it('both standalone bundles exist', () => {
		for (const file of [esmPath, iifePath]) {
			expect(existsSync(file), `dist/${file.split('/').pop()} is missing: run npm run build before the bundle check`).toBe(true)
		}
	})

	it('the ESM bundle has no bare import (not even from vue)', () => {
		const source = readFileSync(esmPath, 'utf8')

		expect(source).not.toMatch(/from\s*["']vue["']/)
		expect(source).not.toMatch(/import\s*["']vue["']/)
		expect(source).not.toMatch(/require\(\s*["']vue["']\s*\)/)
		expect(specifiers(source).filter(isBare)).toEqual([])
	})

	it('the IIFE bundle has no bare import of vue and no require of it', () => {
		const source = readFileSync(iifePath, 'utf8')

		expect(source).not.toMatch(/from\s*["']vue["']/)
		expect(source).not.toMatch(/import\s*["']vue["']/)
		expect(source).not.toMatch(/require\(\s*["']vue["']\s*\)/)
		expect(specifiers(source).filter(isBare)).toEqual([])
	})

	it('the IIFE exposes CraftBugreport with mountReportButton and installErrorBuffer', () => {
		const source = readFileSync(iifePath, 'utf8')

		expect(source).toMatch(/var CraftBugreport=\(function/)
		expect(source).toMatch(/mountReportButton/)
		expect(source).toMatch(/installErrorBuffer/)
	})
})
