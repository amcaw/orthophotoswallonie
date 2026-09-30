<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import type { RegionConfig } from '../regionConfig';

	export let region: RegionConfig;
	export let current: 'lens' | 'timelapse' | 'traveltime';

	const modes = [
		{ id: 'timelapse', label: 'Avant/après' },
		{ id: 'lens', label: 'Loupe' },
		{ id: 'traveltime', label: 'Voyage' }
	] as const;

	const prefix = `${base}${region.name === 'brussels' ? '/brussels' : ''}`;
	let hidden = false;

	onMount(() => {
		hidden = new URLSearchParams(window.location.search).get('modes') === '0';
	});

	function go(e: MouseEvent, id: string) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		window.location.href = `${prefix}/${id}/${window.location.hash}`;
	}
</script>

{#if !hidden}
	<nav class="modes" aria-label="Mode de comparaison">
		{#each modes as mode}
			<a
				href="{prefix}/{mode.id}/"
				aria-current={mode.id === current ? 'page' : undefined}
				on:click={(e) => go(e, mode.id)}>{mode.label}</a
			>
		{/each}
	</nav>
{/if}

<style>
	.modes {
		display: flex;
		align-items: stretch;
		background: var(--paper);
		border-radius: 6px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		font-family: var(--font-ui);
		overflow: hidden;
	}

	a {
		display: flex;
		align-items: center;
		min-height: var(--ctrl-size);
		padding: 0 12px;
		font-size: 14px;
		color: var(--ink-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	a + a {
		border-left: 1px solid #e5e7eb;
	}

	a:hover {
		color: var(--ink);
	}

	a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
		box-shadow: inset 0 -3px 0 var(--accent);
	}

	@media (max-width: 380px) {
		a {
			padding: 0 9px;
			font-size: 13px;
		}
	}
</style>
