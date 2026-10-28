<template>
	<div class="craft-bugreport-reportbutton">
		<p v-if="configError" role="alert" class="craft-bugreport-reportbutton__error">
			{{ configError }}
		</p>
		<template v-else>
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

			<button
				v-if="report && !consentOpen"
				type="button"
				class="craft-bugreport-reportbutton__review"
				@click="openConsent">
				Review the kept report
			</button>

			<ConsentScreen
				v-if="report && consentOpen"
				:report="report"
				:config="config"
				:result="result"
				@result="onResult"
				@keep="closeConsent"
				@delete="deleteReport" />
		</template>
	</div>
</template>

<script>
import ConsentScreen from './ConsentScreen.vue'
import ReportForm from './ReportForm.vue'
import { relayProblem } from '../core/relay.js'

// The button owns the open/closed state, the report and its last send result, so a
// kept report survives closing the consent screen. Focus returns to the button when a
// dialog closes.
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
			consentOpen: false,
			report: null,
			result: null,
		}
	},

	computed: {
		// A config that sets both relayUrl and a drop address is refused here: nothing is shown to send with.
		configError() {
			return relayProblem(this.config)
		},
	},

	methods: {
		openForm() {
			this.open = true
		},

		closeForm() {
			this.open = false
			this.returnFocus()
		},

		onReportBuilt(report) {
			this.report = report
			this.result = null
			this.open = false
			this.consentOpen = true
		},

		openConsent() {
			this.consentOpen = true
		},

		closeConsent() {
			this.consentOpen = false
			this.returnFocus()
		},

		deleteReport() {
			this.report = null
			this.result = null
			this.closeConsent()
		},

		onResult(result) {
			this.result = result
		},

		returnFocus() {
			this.$nextTick(() => {
				this.$refs.button?.focus()
			})
		},
	},
}
</script>

<style scoped>
.craft-bugreport-reportbutton__review {
	margin-left: 8px;
}

.craft-bugreport-reportbutton__error {
	margin: 0;
	color: var(--color-error, #c9302c);
}

.craft-bugreport-reportbutton__open,
.craft-bugreport-reportbutton__review {
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
