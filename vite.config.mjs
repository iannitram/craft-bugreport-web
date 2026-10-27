import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Library mode: one ESM bundle, Vue left to the host app.
export default defineConfig({
	plugins: [vue()],
	build: {
		lib: {
			entry: 'src/index.js',
			formats: ['es'],
			fileName: 'craft-bugreport-web',
		},
		rollupOptions: {
			external: ['vue'],
		},
	},
})
