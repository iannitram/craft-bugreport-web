<template>
	<div class="craft-bugreport-consentscreen">
		{{ label }}
	</div>
</template>

<script>
// Stub (see docs/code-map.md). Built by its issue.
export default {
	name: 'ConsentScreen',
	props: {
		report: { type: Object, required: true },
		config: { type: Object, required: true },
	},

	data() {
		return { label: 'Consent screen (not built yet)' }
	},
}
</script>
