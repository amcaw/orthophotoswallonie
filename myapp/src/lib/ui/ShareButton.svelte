<script lang="ts">
	import { currentUrl } from '../urlState';

	export let text: string;

	let root: HTMLDivElement;
	let open = false;
	let copied = false;

	const networks = [
		{ name: 'Bluesky', href: (u: string, t: string) => `https://bsky.app/intent/compose?text=${t}%20${u}` },
		{ name: 'Facebook', href: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
		{ name: 'LinkedIn', href: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
		{ name: 'WhatsApp', href: (u: string, t: string) => `https://wa.me/?text=${t}%20${u}` },
		{ name: 'X', href: (u: string, t: string) => `https://twitter.com/intent/tweet?text=${t}&url=${u}` }
	];

	async function share() {
		const url = currentUrl();
		const coarse = window.matchMedia('(pointer: coarse)').matches;
		if (coarse && navigator.share) {
			try {
				await navigator.share({ text, url });
				return;
			} catch (error) {
				if ((error as DOMException).name === 'AbortError') return;
			}
		}
		open = !open;
	}

	function openNetwork(network: (typeof networks)[number]) {
		const url = encodeURIComponent(currentUrl());
		window.open(network.href(url, encodeURIComponent(text)), '_blank', 'noopener,width=600,height=500');
		open = false;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(currentUrl());
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
		}
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (open && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window on:pointerdown={onWindowPointerDown} on:keydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="share" bind:this={root}>
	{#if open}
		<div class="menu" role="group" aria-label="Partager">
			{#each networks as network}
				<button on:click={() => openNetwork(network)}>{network.name}</button>
			{/each}
			<button on:click={copy}>{copied ? 'Lien copié' : 'Copier le lien'}</button>
		</div>
	{/if}
	<button class="ctrl-btn" aria-label="Partager cette vue" aria-expanded={open} on:click={share}>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="18" cy="5" r="3" />
			<circle cx="6" cy="12" r="3" />
			<circle cx="18" cy="19" r="3" />
			<line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
			<line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
		</svg>
	</button>
</div>

<style>
	.share {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}

	.menu {
		display: flex;
		flex-direction: column;
		min-width: 170px;
		padding: 4px 0;
		background: var(--paper);
		border-radius: 8px;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
	}

	.menu button {
		min-height: 40px;
		padding: 0 14px;
		border: none;
		background: none;
		font: inherit;
		font-size: 14px;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}

	.menu button:last-child {
		border-top: 1px solid #e5e7eb;
	}

	.menu button:hover,
	.menu button:focus-visible {
		background: #f1f3f4;
		outline: none;
	}
</style>
