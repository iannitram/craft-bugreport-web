<template>
	<div class="craft-bugreport-reportform">
		{{ label }}
	</div>
</template>

<script>
// Stub (see docs/code-map.md). Built by its issue.
export default {
	name: 'ReportForm',
	props: {
		config: { type: Object, required: true },
		getWorkingFile: { type: Function, default: null },
	},

	data() {
		return { label: 'Report form (not built yet)' }
	},
}
</script>
