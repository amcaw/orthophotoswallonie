<script lang="ts">
	import { createEventDispatcher, onDestroy, tick } from 'svelte';
	import type { YearEntry, YearOption } from '../years';
	import { findOption } from '../years';

	export let entries: YearEntry[];
	export let selectedId: string;
	export let label: string;
	export let variant: 'big' | 'pill' = 'big';
	export let align: 'start' | 'end' | 'center' = 'start';
	export let direction: 'down' | 'up' = 'down';
	export let loading = false;

	const dispatch = createEventDispatcher<{ select: { id: string } }>();

	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let list: HTMLDivElement;
	let open = false;

	$: selected = findOption(entries, selectedId) ?? entries[entries.length - 1].combined;
	$: sections = [
		{ title: 'Cartes anciennes', items: entries.filter((e) => e.kind === 'map') },
		{ title: 'Photos aériennes', items: entries.filter((e) => e.kind === 'photo') }
	].filter((section) => section.items.length);

	function meta(option: YearOption) {
		return [option.season, option.partial ? 'zone partielle' : null].filter(Boolean).join(' · ');
	}

	function rows() {
		return list ? [...list.querySelectorAll<HTMLButtonElement>('button[data-option]')] : [];
	}

	async function toggle() {
		open = !open;
		if (!open) return;
		await tick();
		const current = rows().find((row) => row.dataset.option === selected.id) ?? rows()[0];
		if (current && list) list.scrollTop = current.offsetTop - list.clientHeight / 2 + current.offsetHeight / 2;
		current?.focus({ preventScroll: true });
	}

	function close(returnFocus = false) {
		open = false;
		if (returnFocus) trigger?.focus({ preventScroll: true });
	}

	function choose(id: string) {
		close(true);
		if (id !== selected.id) dispatch('select', { id });
	}

	function onListKeydown(e: KeyboardEvent) {
		const items = rows();
		const index = items.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			close(true);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			items[Math.min(index + 1, items.length - 1)]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			items[Math.max(index - 1, 0)]?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			items[0]?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			items[items.length - 1]?.focus();
		}
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (open && !root.contains(e.target as Node)) close();
	}

	onDestroy(() => (open = false));
</script>

<svelte:window on:pointerdown={onWindowPointerDown} on:keydown={(e) => open && list?.contains(document.activeElement) && onListKeydown(e)} />

<div class="year-select {variant} align-{align} dir-{direction}" class:open bind:this={root}>
	<button
		class="trigger"
		bind:this={trigger}
		aria-haspopup="true"
		aria-expanded={open}
		aria-label="{label} : {selected.year}{selected.season ? `, ${selected.season}` : ''}. Changer d'année"
		on:click={toggle}
	>
		<span class="value">
			<span class="year">{selected.year}{#if variant === 'pill' && selected.id !== selected.year && selected.season}{` · ${selected.season}`}{/if}</span>
			{#if variant === 'big' && (meta(selected) || entries.find((e) => e.year === selected.year)?.title)}
				<span class="meta">{entries.find((e) => e.year === selected.year)?.title ?? meta(selected)}</span>
			{/if}
		</span>
		<svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
		{#if loading}<span class="loading" aria-hidden="true"></span>{/if}
	</button>

	{#if open}
		<div class="list" bind:this={list} role="group" aria-label={label}>
			{#each sections as section}
				<div class="section-title">{section.title}</div>
				{#each section.items as entry}
					<button
						class="row"
						data-option={entry.combined.id}
						aria-current={entry.combined.id === selected.id ? 'true' : undefined}
						on:click={() => choose(entry.combined.id)}
					>
						<span class="row-year">{entry.year}</span>
						<span class="row-meta">{entry.title ?? meta(entry.combined)}</span>
					</button>
					{#each entry.seasons as option}
						<button
							class="row sub"
							data-option={option.id}
							aria-current={option.id === selected.id ? 'true' : undefined}
							on:click={() => choose(option.id)}
						>
							<span class="row-year">{option.season} seul</span>
							<span class="row-meta">{option.partial ? 'zone partielle' : ''}</span>
						</button>
					{/each}
				{/each}
			{/each}
		</div>
	{/if}
</div>

<style>
	.year-select {
		position: relative;
		font-family: var(--font-ui);
	}

	.trigger {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: var(--ctrl-size);
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
		color: inherit;
		text-align: left;
	}

	.trigger:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 3px;
		border-radius: 4px;
	}

	.value {
		display: flex;
		flex-direction: column;
		line-height: 1;
	}

	.big .trigger {
		color: #fff;
		text-shadow: var(--year-shadow);
	}

	.big .year {
		font-size: clamp(26px, 5vw, 40px);
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.big .meta {
		margin-top: 4px;
		font-size: 13px;
		font-weight: 400;
	}

	.big .caret {
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
	}

	.pill .trigger {
		padding: 0 12px;
		border-radius: 999px;
		background: var(--overlay);
		color: #fff;
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
	}

	.align-end .trigger {
		flex-direction: row-reverse;
		text-align: right;
	}

	.align-end .value {
		align-items: flex-end;
	}

	.loading {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -5px;
		height: 2px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.35);
	}

	.loading::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 40%;
		background: #fff;
		animation: slide 1s ease-in-out infinite;
	}

	.pill .loading {
		left: 12px;
		right: 12px;
		bottom: 5px;
	}

	@keyframes slide {
		from {
			left: -40%;
		}
		to {
			left: 100%;
		}
	}

	.list {
		position: absolute;
		z-index: 300;
		top: calc(100% + 8px);
		left: 0;
		width: 240px;
		max-height: min(60vh, 380px);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--paper);
		color: var(--ink);
		border-radius: 8px;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
		padding: 4px 0;
		text-shadow: none;
	}

	.align-end .list {
		left: auto;
		right: 0;
	}

	.align-center .list {
		left: 50%;
		transform: translateX(-50%);
	}

	.dir-up .list {
		top: auto;
		bottom: calc(100% + 8px);
	}

	.section-title {
		padding: 10px 14px 4px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-muted);
	}

	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		min-height: 44px;
		padding: 0 14px;
		border: none;
		border-left: 3px solid transparent;
		background: none;
		font: inherit;
		font-size: 15px;
		color: inherit;
		text-align: left;
		cursor: pointer;
		align-items: center;
	}

	.row:hover,
	.row:focus-visible {
		background: #f1f3f4;
		outline: none;
	}

	.row[aria-current='true'] {
		border-left-color: var(--accent);
		font-weight: 700;
	}

	.row.sub {
		min-height: 40px;
		padding-left: 30px;
		font-size: 14px;
	}

	.row-meta {
		font-size: 12px;
		font-weight: 400;
		color: var(--ink-muted);
		text-align: right;
	}
</style>
