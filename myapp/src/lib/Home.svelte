<script lang="ts">
	import { base } from '$app/paths';
	import type { RegionConfig } from './regionConfig';
	import { walloniaConfig, brusselsConfig } from './regionConfig';
	import { buildYears } from './years';

	export let region: RegionConfig;

	const regions = [walloniaConfig, brusselsConfig];
	const entries = buildYears(region.orthophotos);
	const photos = entries.filter((e) => e.kind === 'photo');
	const maps = entries.filter((e) => e.kind === 'map');
	const firstPhoto = photos[0].startYear;
	const lastPhoto = photos[photos.length - 1].startYear;
	const prefix = `${base}${region.name === 'brussels' ? '/brussels' : ''}`;
	const title = region.name === 'brussels' ? 'Bruxelles vue du ciel' : 'La Wallonie vue du ciel';

	const modes = [
		{ id: 'timelapse', name: 'Avant/après', verb: 'Comparer deux années en glissant une barre' },
		{ id: 'lens', name: 'Loupe', verb: 'Regarder le passé à travers une loupe' },
		{ id: 'traveltime', name: 'Voyage', verb: `Faire défiler ${lastPhoto - firstPhoto} ans de photos aériennes` }
	];

	function hrefFor(target: RegionConfig) {
		return `${base}${target.name === 'brussels' ? '/brussels' : ''}/`;
	}
</script>

<main class="home">
	<nav class="regions" aria-label="Région">
		{#each regions as target}
			<a href={hrefFor(target)} aria-current={target.name === region.name ? 'page' : undefined}>{target.displayName}</a>
		{/each}
	</nav>

	<h1>{title}</h1>
	<p class="lede">
		Photos aériennes de {firstPhoto} à {lastPhoto}{#if maps.length}, cartes anciennes depuis {maps[0].startYear}{/if}.
	</p>

	<ul class="modes">
		{#each modes as mode}
			<li>
				<a href="{prefix}/{mode.id}/">
					<span class="name">{mode.name}</span>
					<span class="verb">{mode.verb}</span>
				</a>
			</li>
		{/each}
	</ul>
</main>

<style>
	:global(body) {
		margin: 0;
		background: var(--paper);
	}

	.home {
		max-width: 640px;
		margin: 0 auto;
		padding: 48px 20px;
		font-family: var(--font-ui);
		color: var(--ink);
	}

	.regions {
		display: flex;
		gap: 20px;
		margin-bottom: 40px;
		font-size: 15px;
	}

	.regions a {
		padding: 10px 0;
		color: var(--ink-muted);
		text-decoration: none;
	}

	.regions a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
		box-shadow: inset 0 -3px 0 var(--accent);
	}

	h1 {
		margin: 0 0 12px;
		font-size: clamp(32px, 7vw, 48px);
		line-height: 1.05;
		letter-spacing: -0.02em;
	}

	.lede {
		margin: 0 0 40px;
		font-size: 18px;
		line-height: 1.4;
		color: var(--ink-muted);
	}

	.modes {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid #e5e7eb;
	}

	.modes li {
		border-bottom: 1px solid #e5e7eb;
	}

	.modes a {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 18px 0;
		color: inherit;
		text-decoration: none;
	}

	.name {
		font-size: 20px;
		font-weight: 700;
	}

	.name::after {
		content: ' →';
		color: var(--accent);
	}

	.verb {
		font-size: 15px;
		color: var(--ink-muted);
	}

	.modes a:hover .name,
	.modes a:focus-visible .name {
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 4px;
	}
</style>
