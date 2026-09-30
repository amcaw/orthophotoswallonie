<script lang="ts">
	import { onMount } from 'svelte';

	export let text: string;
	export let storageKey: string;
	export let visible = false;

	let root: HTMLDivElement;

	function seen() {
		try {
			return localStorage.getItem(storageKey) === '1';
		} catch {
			return false;
		}
	}

	function dismiss() {
		if (!visible) return;
		visible = false;
		try {
			localStorage.setItem(storageKey, '1');
		} catch {}
	}

	onMount(() => {
		if (seen()) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				observer.disconnect();
				visible = true;
				const events = ['pointerdown', 'keydown', 'wheel'] as const;
				const onInteract = () => {
					events.forEach((name) => window.removeEventListener(name, onInteract, true));
					dismiss();
				};
				events.forEach((name) => window.addEventListener(name, onInteract, { capture: true, passive: true }));
			},
			{ threshold: 0.5 }
		);
		observer.observe(root.parentElement ?? root);
		return () => observer.disconnect();
	});
</script>

<div class="hint" class:visible bind:this={root} role="status" aria-live="polite">
	{#if visible}{text}{/if}
</div>

<style>
	.hint {
		position: absolute;
		left: 50%;
		bottom: calc(var(--chrome-bottom) + var(--ctrl-size) + 24px);
		z-index: 110;
		transform: translate(-50%, 6px);
		max-width: calc(100% - 2 * var(--chrome-gap) - 2 * var(--ctrl-size) - 32px);
		padding: 8px 14px;
		border-radius: 6px;
		background: var(--overlay);
		color: #fff;
		font-family: var(--font-ui);
		font-size: 14px;
		line-height: 1.3;
		text-align: center;
		pointer-events: none;
		opacity: 0;
		transition:
			opacity 0.25s,
			transform 0.25s;
	}

	.hint.visible {
		opacity: 1;
		transform: translate(-50%, 0);
	}
</style>
