<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	export let steps: { selector: string; text: string; position?: 'top' | 'bottom' | 'left' | 'right' }[] = [];
	export let storageKey = 'tutorial-seen';

	let currentStep = 0;
	let visible = false;
	let tooltipStyle = '';
	let arrowClass = '';
	let highlightStyle = '';
	let rafId: number | null = null;

	function getTargetEl(): HTMLElement | null {
		if (currentStep >= steps.length) return null;
		return document.querySelector(steps[currentStep].selector);
	}

	function positionTooltip() {
		const el = getTargetEl();
		if (!el) {
			// Element not found yet — retry on next frame
			rafId = requestAnimationFrame(positionTooltip);
			return;
		}

		const rect = el.getBoundingClientRect();
		const pad = 8;
		const pos = steps[currentStep].position || 'bottom';

		// Highlight cutout
		const m = 4;
		highlightStyle = `top:${rect.top - m}px;left:${rect.left - m}px;width:${rect.width + m * 2}px;height:${rect.height + m * 2}px`;

		// Tooltip position
		let top = 0;
		let left = 0;
		const tooltipW = 280;
		const tooltipH = 120; // estimate

		if (pos === 'bottom') {
			top = rect.bottom + pad + 10;
			left = rect.left + rect.width / 2 - tooltipW / 2;
		} else if (pos === 'top') {
			top = rect.top - pad - tooltipH - 10;
			left = rect.left + rect.width / 2 - tooltipW / 2;
		} else if (pos === 'right') {
			top = rect.top + rect.height / 2 - tooltipH / 2;
			left = rect.right + pad + 10;
		} else {
			top = rect.top + rect.height / 2 - tooltipH / 2;
			left = rect.left - pad - tooltipW - 10;
		}

		// Clamp to viewport
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		if (left < 10) left = 10;
		if (left + tooltipW > vw - 10) left = vw - tooltipW - 10;
		if (top < 10) top = 10;
		if (top + tooltipH > vh - 10) top = vh - tooltipH - 10;

		tooltipStyle = `top:${top}px;left:${left}px`;
		arrowClass = pos;
	}

	function next() {
		currentStep++;
		if (currentStep >= steps.length) {
			finish();
		} else {
			positionTooltip();
		}
	}

	function finish() {
		visible = false;
		try { localStorage.setItem(storageKey, '1'); } catch {}
	}

	onMount(() => {
		try {
			if (localStorage.getItem(storageKey)) return;
		} catch {}

		if (steps.length === 0) return;

		// Delay to let map UI render
		setTimeout(() => {
			visible = true;
			positionTooltip();
		}, 1500);
	});

	onDestroy(() => {
		if (rafId) cancelAnimationFrame(rafId);
	});
</script>

{#if visible && currentStep < steps.length}
	<!-- Backdrop with cutout -->
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div class="tutorial-backdrop" on:click={finish}>
		<div class="tutorial-highlight" style={highlightStyle}></div>
	</div>

	<!-- Tooltip -->
	<div class="tutorial-tooltip {arrowClass}" style={tooltipStyle}>
		<div class="tutorial-step-indicator">
			{currentStep + 1} / {steps.length}
		</div>
		<p class="tutorial-text">{steps[currentStep].text}</p>
		<div class="tutorial-actions">
			<button class="tutorial-skip" on:click={finish}>Passer</button>
			<button class="tutorial-next" on:click={next}>
				{currentStep === steps.length - 1 ? 'Terminer' : 'Suivant'}
			</button>
		</div>
	</div>
{/if}

<style>
	.tutorial-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9998;
		background: rgba(0, 0, 0, 0.55);
		/* Use mix-blend-mode trick: the highlight div punches through */
	}

	.tutorial-highlight {
		position: fixed;
		border-radius: 8px;
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
		background: transparent;
		z-index: 9998;
		pointer-events: none;
		transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.tutorial-tooltip {
		position: fixed;
		z-index: 9999;
		width: 280px;
		background: white;
		border-radius: 12px;
		padding: 16px;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
		transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
		animation: tooltip-enter 0.3s ease-out;
	}

	@keyframes tooltip-enter {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.tutorial-step-indicator {
		font-size: 11px;
		color: #94a3b8;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 6px;
	}

	.tutorial-text {
		margin: 0 0 14px 0;
		font-size: 14px;
		line-height: 1.5;
		color: #1e293b;
	}

	.tutorial-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.tutorial-skip {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 13px;
		cursor: pointer;
		padding: 6px 10px;
		border-radius: 6px;
		transition: color 0.2s;
	}

	.tutorial-skip:hover {
		color: #64748b;
	}

	.tutorial-next {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 8px 18px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.tutorial-next:hover {
		background: #2563eb;
	}
</style>
