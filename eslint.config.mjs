import { recommended } from '@nextcloud/eslint-config'

export default [
	...recommended,
	{
		ignores: ['dist/**', 'node_modules/**'],
	},
]
