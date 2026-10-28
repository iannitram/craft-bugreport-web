<template>
	<div class="craft-bugreport-overlay">
		<div
			ref="dialog"
			class="craft-bugreport-dialog"
			role="dialog"
			aria-modal="true"
			:aria-labelledby="ids.title"
			@keydown="onKeydown">
			<h2 :id="ids.title" class="craft-bugreport-dialog__title">
				Report a bug
			</h2>

			<div class="craft-bugreport-field">
				<label :for="ids.what">
					What happened? <span class="craft-bugreport-hint">(required)</span>
				</label>
				<textarea
					:id="ids.what"
					ref="what"
					v-model="whatHappened"
					rows="4"
					required
					aria-required="true" />
			</div>

			<div class="craft-bugreport-field">
				<label :for="ids.expected">What did you expect?</label>
				<textarea :id="ids.expected" v-model="expected" rows="3" />
			</div>

			<div class="craft-bugreport-field">
				<span class="craft-bugreport-field__label">Screenshot</span>
				<div class="craft-bugreport-row">
					<button
						type="button"
						class="craft-bugreport-button"
						:aria-label="`Choose image (screenshot, up to ${maxMegabytes} MB)`"
						:aria-describedby="screenshotError ? `${ids.hint} ${ids.screenshotError}` : ids.hint"
						@click="$refs.file.click()">
						Choose image
					</button>
					<button
						v-if="screenshot"
						type="button"
						class="craft-bugreport-button"
						@click="removeScreenshot">
						Remove image
					</button>
					<span v-if="screenshot" class="craft-bugreport-hint">{{ screenshot.name }}</span>
				</div>
				<p :id="ids.hint" class="craft-bugreport-hint">
					Up to {{ maxMegabytes }} MB.
				</p>
				<p
					v-if="screenshotError"
					:id="ids.screenshotError"
					role="alert"
					class="craft-bugreport-error">
					{{ screenshotError }}
				</p>
				<input
					:id="ids.file"
					ref="file"
					type="file"
					accept="image/*"
					hidden
					aria-label="Screenshot image file"
					@change="onFileChosen">
			</div>

			<div v-if="getWorkingFile" class="craft-bugreport-field">
				<label class="craft-bugreport-checkbox">
					<input v-model="includeWorkingFile" type="checkbox">
					Include the document I was working on
				</label>
			</div>

			<p v-if="formError" role="alert" class="craft-bugreport-error">
				{{ formError }}
			</p>

			<div class="craft-bugreport-row craft-bugreport-actions">
				<button type="button" class="craft-bugreport-button" @click="$emit('close')">
					Cancel
				</button>
				<button
					type="button"
					class="craft-bugreport-button craft-bugreport-button--primary"
					:disabled="!canMakeReport"
					@click="makeReport">
					Make the report
				</button>
			</div>
		</div>
	</div>
</template>

<script>
import { buildReport, MAX_SCREENSHOT_BYTES } from '../core/report.js'

let formCount = 0

// The form fields, the screenshot picker and the working-file box. The working-file box
// always starts unticked because the form is remounted each time it opens.
export default {
	name: 'ReportForm',
	props: {
		config: { type: Object, required: true },
		getWorkingFile: { type: Function, default: null },
	},

	emits: ['makeReport', 'close'],

	data() {
		formCount += 1
		return {
			uid: formCount,
			whatHappened: '',
			expected: '',
			screenshot: null,
			screenshotError: '',
			includeWorkingFile: false,
			formError: '',
			busy: false,
			alive: true,
			maxMegabytes: Math.round(MAX_SCREENSHOT_BYTES / (1024 * 1024)),
		}
	},

	computed: {
		ids() {
			const base = `craft-bugreport-${this.uid}`
			return {
				title: `${base}-title`,
				what: `${base}-what`,
				expected: `${base}-expected`,
				file: `${base}-file`,
				hint: `${base}-hint`,
				screenshotError: `${base}-screenshot-error`,
			}
		},

		canMakeReport() {
			return this.whatHappened.trim() !== '' && !this.busy
		},
	},

	mounted() {
		this.$refs.what.focus()
	},

	beforeUnmount() {
		this.alive = false
	},

	methods: {
		onKeydown(event) {
			if (event.key === 'Escape') {
				event.preventDefault()
				this.$emit('close')
				return
			}
			if (event.key === 'Tab') {
				this.trapTab(event)
			}
		},

		// Keep Tab and Shift+Tab inside the dialog.
		trapTab(event) {
			const items = this.$refs.dialog.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([hidden])')
			if (items.length === 0) {
				return
			}
			const first = items[0]
			const last = items[items.length - 1]
			const active = document.activeElement
			const inside = this.$refs.dialog.contains(active)

			if (event.shiftKey && (active === first || !inside)) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && (active === last || !inside)) {
				event.preventDefault()
				first.focus()
			}
		},

		onFileChosen(event) {
			const input = event.target
			const file = input.files?.[0] ?? null
			input.value = ''

			this.screenshot = null
			this.screenshotError = ''
			if (!file) {
				return
			}
			if (file.type && !file.type.startsWith('image/')) {
				this.screenshotError = 'That file is not an image. Choose a PNG, JPEG or WebP image.'
				return
			}
			if (file.size > MAX_SCREENSHOT_BYTES) {
				this.screenshotError = `That image is larger than ${this.maxMegabytes} MB, so it was not attached. Choose a smaller image.`
				return
			}
			this.screenshot = file
		},

		removeScreenshot() {
			this.screenshot = null
			this.screenshotError = ''
		},

		async makeReport() {
			if (!this.canMakeReport) {
				return
			}
			this.busy = true
			this.formError = ''
			try {
				const report = await buildReport({
					config: this.config,
					whatHappened: this.whatHappened,
					expected: this.expected,
					screenshot: this.screenshot,
					includeWorkingFile: this.includeWorkingFile,
					getWorkingFile: this.getWorkingFile,
				})
				if (this.alive) {
					this.$emit('makeReport', report)
				}
			} catch (error) {
				if (this.alive) {
					this.formError = `The report could not be made. ${error?.message ?? ''}`.trim()
				}
			} finally {
				this.busy = false
			}
		},
	},
}
</script>

<style scoped>
.craft-bugreport-overlay {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.4);
}

.craft-bugreport-dialog {
	box-sizing: border-box;
	width: min(480px, 92vw);
	max-height: 90vh;
	overflow: auto;
	padding: 16px;
	border-radius: var(--border-radius-large, var(--border-radius, 12px));
	background: var(--color-main-background, #fff);
	color: var(--color-main-text, #222);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.craft-bugreport-dialog__title {
	margin: 0 0 12px;
	font-size: 1.3em;
}

.craft-bugreport-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-bottom: 12px;
}

.craft-bugreport-field__label {
	font-weight: bold;
}

.craft-bugreport-field textarea {
	box-sizing: border-box;
	width: 100%;
	padding: 6px;
	border: 1px solid var(--color-border-dark, #888);
	border-radius: var(--border-radius, 8px);
	background: var(--color-main-background, #fff);
	color: var(--color-main-text, #222);
	font: inherit;
	resize: vertical;
}

.craft-bugreport-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.craft-bugreport-actions {
	justify-content: flex-end;
	margin-top: 16px;
}

.craft-bugreport-button {
	padding: 6px 12px;
	border: 1px solid var(--color-border-dark, #888);
	border-radius: var(--border-radius, 8px);
	background: var(--color-main-background, #fff);
	color: var(--color-main-text, #222);
	cursor: pointer;
}

.craft-bugreport-button--primary {
	border-color: var(--color-primary-element, #0082c9);
	background: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #fff);
}

.craft-bugreport-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.craft-bugreport-checkbox {
	display: flex;
	align-items: center;
	gap: 6px;
}

.craft-bugreport-hint {
	color: var(--color-text-maxcontrast, #6b6b6b);
	font-size: 0.9em;
}

.craft-bugreport-error {
	margin: 0;
	color: var(--color-error, #c9302c);
}

input:focus-visible,
textarea:focus-visible,
button:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}
</style>
