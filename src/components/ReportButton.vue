<template>
	<div class="craft-bugreport-reportbutton">
		<button
			ref="button"
			type="button"
			class="craft-bugreport-reportbutton__open"
			aria-haspopup="dialog"
			:aria-expanded="open ? 'true' : 'false'"
			@click="openForm">
			{{ label }}
		</button>

		<ReportForm
			v-if="open"
			:config="config"
			:getWorkingFile="getWorkingFile"
			@makeReport="onReportBuilt"
			@close="closeForm" />

		<ConsentScreen v-if="report" :report="report" :config="config" />
	</div>
</template>

<script>
import ConsentScreen from './ConsentScreen.vue'
import ReportForm from './ReportForm.vue'

// The button owns the open/closed state. Closing the form returns focus to the button.
export default {
	name: 'ReportButton',
	components: { ConsentScreen, ReportForm },
	props: {
		config: { type: Object, required: true },
		getWorkingFile: { type: Function, default: null },
	},

	data() {
		return {
			label: 'Report a bug',
			open: false,
			report: null,
		}
	},

	methods: {
		openForm() {
			this.open = true
		},

		closeForm() {
			this.open = false
			this.$nextTick(() => {
				this.$refs.button?.focus()
			})
		},

		onReportBuilt(report) {
			this.report = report
			this.open = false
		},
	},
}
</script>

<style scoped>
.craft-bugreport-reportbutton__open {
	padding: 6px 12px;
	border: 1px solid var(--color-border-dark, #bbb);
	border-radius: var(--border-radius, 8px);
	background: var(--color-main-background, #fff);
	color: var(--color-main-text, #222);
	cursor: pointer;
}

.craft-bugreport-reportbutton__open:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}
</style>
