import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Standalone build for hosts without Vue: src/standalone.js with Vue bundled in, as an ESM module and as an
// IIFE (global CraftBugreport). The CSS is emitted next to them as craft-bugreport-web.standalone.css.
// Runs after vite.config.mjs in `npm run build`; emptyOutDir is off so it keeps the library build's files.
export default defineConfig({
	plugins: [vue()],
	define: {
		'process.env.NODE_ENV': JSON.stringify('production'),
	},
	build: {
		emptyOutDir: false,
		lib: {
			entry: 'src/standalone.js',
			name: 'CraftBugreport',
			formats: ['es', 'iife'],
			fileName: (format) => (format === 'es' ? 'craft-bugreport-web.standalone.js' : 'craft-bugreport-web.standalone.iife.js'),
			cssFileName: 'craft-bugreport-web.standalone',
		},
	},
})
