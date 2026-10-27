<template>
	<div class="craft-bugreport-reportbutton">
		{{ label }}
	</div>
</template>

<script>
// Stub (see docs/code-map.md). Built by its issue.
export default {
	name: 'ReportButton',
	props: {
		config: { type: Object, required: true },
		getWorkingFile: { type: Function, default: null },
	},
	data() {
		return { label: 'Report a bug' }
	},
}
</script>
