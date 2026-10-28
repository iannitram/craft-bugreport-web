<template>
	<div class="craft-bugreport-overlay">
		<div
			ref="dialog"
			class="craft-bugreport-dialog"
			role="dialog"
			aria-modal="true"
			:aria-labelledby="ids.title"
			@keydown="onKeydown">
			<h2
				:id="ids.title"
				ref="title"
				tabindex="-1"
				class="craft-bugreport-dialog__title">
				Check what will be sent
			</h2>
			<p class="craft-bugreport-hint">
				Nothing is sent until you press Send. Every file in the report is listed here.
			</p>

			<ul class="craft-bugreport-files">
				<li v-for="file in report.files" :key="file.name" class="craft-bugreport-file">
					<div class="craft-bugreport-row">
						<span class="craft-bugreport-file__name">{{ file.name }}</span>
						<span class="craft-bugreport-hint">{{ formatSize(file.size) }}</span>
						<span v-if="file.sentAsIs" class="craft-bugreport-badge">sent as is, not scrubbed</span>
						<button
							type="button"
							class="craft-bugreport-button"
							:aria-label="`Show me ${file.name}`"
							:aria-expanded="previewName === file.name ? 'true' : 'false'"
							@click="showMe(file)">
							Show me
						</button>
					</div>

					<div v-if="previewName === file.name" class="craft-bugreport-preview">
						<pre v-if="preview.kind === 'text'">{{ preview.text }}</pre>
						<img v-else-if="preview.kind === 'image'" :src="preview.url" :alt="file.name">
						<p v-else class="craft-bugreport-hint">
							{{ file.name }}: {{ formatSize(file.size) }}. It is not shown here.
						</p>
					</div>
				</li>
			</ul>

			<p class="craft-bugreport-status" role="status">
				{{ sent ? 'Sent' : 'Not sent yet' }}
			</p>
			<p
				v-if="notice"
				:role="sent ? 'status' : 'alert'"
				class="craft-bugreport-notice"
				:class="{ 'craft-bugreport-error': !sent }">
				{{ notice }}
			</p>

			<div class="craft-bugreport-row craft-bugreport-actions">
				<button type="button" class="craft-bugreport-button" @click="keep">
					Keep
				</button>
				<button
					type="button"
					class="craft-bugreport-button"
					:disabled="sending"
					@click="$emit('delete')">
					Delete
				</button>
				<button
					type="button"
					class="craft-bugreport-button craft-bugreport-button--primary"
					:disabled="!canSend"
					@click="send">
					{{ sending ? 'Sending' : 'Send' }}
				</button>
			</div>
		</div>
	</div>
</template>

<script>
import { relayProblem } from '../core/relay.js'
import { sendReport } from '../core/upload.js'

const NOT_SET_UP = 'Bug reports are not set up for this app (no drop address).'
const TEXT_EXTENSIONS = ['txt', 'log', 'json', 'opml', 'md']
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

let consentCount = 0

/**
 * @param {string} name a file name
 * @return {string} the lowercase extension, or '' when there is none
 */
function extensionOf(name) {
	const dot = name.lastIndexOf('.')
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// The consent screen: lists every file, sends only when Send is pressed, and never
// sends on its own. The button owns the report and the last result (so Keep keeps them).
export default {
	name: 'ConsentScreen',
	props: {
		report: { type: Object, required: true },
		config: { type: Object, required: true },
		result: { type: Object, default: null },
	},

	emits: ['result', 'keep', 'delete'],

	data() {
		consentCount += 1
		return {
			uid: consentCount,
			sending: false,
			previewName: '',
			preview: null,
		}
	},

	computed: {
		ids() {
			return { title: `craft-bugreport-consent-${this.uid}-title` }
		},

		// A relay config (relayUrl) or a direct drop config (dropBase and dropToken), never both.
		configProblem() {
			return relayProblem(this.config)
		},

		hasTransport() {
			return Boolean(this.config.relayUrl || (this.config.dropBase && this.config.dropToken))
		},

		sent() {
			return this.result?.ok === true
		},

		notice() {
			if (this.configProblem) {
				return this.configProblem
			}
			if (!this.hasTransport) {
				return NOT_SET_UP
			}
			return this.result?.message ?? ''
		},

		canSend() {
			return !this.configProblem && this.hasTransport && !this.sending && !this.sent
		},
	},

	mounted() {
		this.$refs.title.focus()
	},

	beforeUnmount() {
		this.closePreview()
	},

	methods: {
		formatSize(bytes) {
			if (bytes < 1024) {
				return `${bytes} B`
			}
			if (bytes < 1024 * 1024) {
				return `${(bytes / 1024).toFixed(1)} KB`
			}
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
		},

		// Show one file: text as text, images as an image from an object URL, others as a size line.
		showMe(file) {
			this.closePreview()
			if (this.previewName === file.name) {
				this.previewName = ''
				return
			}

			const extension = extensionOf(file.name)
			this.previewName = file.name
			if (TEXT_EXTENSIONS.includes(extension)) {
				this.preview = { kind: 'text', text: new TextDecoder().decode(file.data) }
			} else if (IMAGE_TYPES[extension]) {
				const blob = new Blob([file.data], { type: IMAGE_TYPES[extension] })
				this.preview = { kind: 'image', url: URL.createObjectURL(blob) }
			} else {
				this.preview = { kind: 'size' }
			}
		},

		closePreview() {
			if (this.preview?.kind === 'image') {
				URL.revokeObjectURL(this.preview.url)
			}
			this.preview = null
			this.previewName = ''
		},

		keep() {
			this.closePreview()
			this.$emit('keep')
		},

		onKeydown(event) {
			if (event.key === 'Escape') {
				event.preventDefault()
				this.keep()
				return
			}
			if (event.key === 'Tab') {
				this.trapTab(event)
			}
		},

		// Keep Tab and Shift+Tab inside the dialog.
		trapTab(event) {
			const items = this.$refs.dialog.querySelectorAll('button:not([disabled])')
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

		// Send is the only place that calls sendReport.
		async send() {
			if (!this.canSend) {
				return
			}
			this.sending = true
			try {
				const result = await sendReport(this.report, {
					relayUrl: this.config.relayUrl,
					headers: this.config.headers,
					dropBase: this.config.dropBase,
					dropToken: this.config.dropToken,
					app: this.config.app,
				})
				this.$emit('result', result)
			} catch (error) {
				this.$emit('result', { ok: false, message: `The report could not be sent. ${error?.message ?? ''}`.trim() })
			} finally {
				this.sending = false
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
	width: min(560px, 92vw);
	max-height: 90vh;
	overflow: auto;
	padding: 16px;
	border-radius: var(--border-radius-large, var(--border-radius, 12px));
	background: var(--color-main-background, #fff);
	color: var(--color-main-text, #222);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.craft-bugreport-dialog__title {
	margin: 0 0 8px;
	font-size: 1.3em;
}

.craft-bugreport-files {
	margin: 12px 0;
	padding: 0;
	list-style: none;
}

.craft-bugreport-file {
	padding: 6px 0;
	border-bottom: 1px solid var(--color-border, #ddd);
}

.craft-bugreport-file__name {
	font-family: monospace;
	word-break: break-all;
}

.craft-bugreport-badge {
	padding: 0 6px;
	border-radius: var(--border-radius, 8px);
	background: var(--color-warning, #fff3cd);
	color: var(--color-main-text, #222);
	font-size: 0.85em;
}

.craft-bugreport-preview {
	margin-top: 6px;
}

.craft-bugreport-preview pre {
	max-height: 240px;
	margin: 0;
	padding: 8px;
	overflow: auto;
	white-space: pre-wrap;
	background: var(--color-background-dark, #f2f2f2);
}

.craft-bugreport-preview img {
	max-width: 100%;
	max-height: 360px;
}

.craft-bugreport-status {
	margin: 8px 0 0;
	font-weight: bold;
}

.craft-bugreport-notice {
	margin: 4px 0 0;
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

.craft-bugreport-hint {
	margin: 0;
	color: var(--color-text-maxcontrast, #6b6b6b);
	font-size: 0.9em;
}

.craft-bugreport-error {
	color: var(--color-error, #c9302c);
}

button:focus-visible,
.craft-bugreport-dialog__title:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}
</style>
