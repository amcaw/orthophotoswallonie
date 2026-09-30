<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import type { GeocoderConfig } from '../regionConfig';
	import { createGeocoderApi } from '../geocoder';

	export let map: maplibregl.Map | undefined;
	export let config: GeocoderConfig;

	let root: HTMLDivElement;
	let field: HTMLDivElement;
	let open = false;
	let geocoder: any;
	let results: any[] = [];
	let activeIndex = 0;

	$: if (map && field && !geocoder) mount(map);

	function input() {
		return field?.querySelector('input') as HTMLInputElement | null;
	}

	function suggestions() {
		return field ? [...field.querySelectorAll('.suggestions > li')] : [];
	}

	function highlight(index: number) {
		activeIndex = index;
		suggestions().forEach((s, i) => s.classList.toggle('active', i === index));
	}

	function zoomTo(result: any) {
		if (!map) return;
		const bbox = result.bbox ?? result.properties?.bbox;
		if (Array.isArray(bbox) && bbox.length === 4) {
			map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 50, maxZoom: 16, duration: 1200 });
		} else {
			map.flyTo({ center: result.center, zoom: 15, duration: 1200 });
		}
	}

	function choose(result: any) {
		zoomTo(result);
		const el = input();
		el?.blur();
		setTimeout(() => {
			if (el) el.value = '';
			geocoder.clear();
			results = [];
			open = false;
		}, 100);
	}

	function onKeydown(e: KeyboardEvent) {
		const count = suggestions().length;
		if (e.key === 'Escape') {
			open = false;
			input()?.blur();
		} else if (e.key === 'Enter' && results.length) {
			e.preventDefault();
			e.stopImmediatePropagation();
			choose(results[activeIndex] ?? results[0]);
		} else if (e.key === 'ArrowDown' && count) {
			e.preventDefault();
			highlight(Math.min(activeIndex + 1, count - 1));
		} else if (e.key === 'ArrowUp' && count) {
			e.preventDefault();
			highlight(Math.max(activeIndex - 1, 0));
		}
	}

	function mount(target: maplibregl.Map) {
		const { api } = createGeocoderApi(config);
		geocoder = new MaplibreGeocoder(api, {
			maplibregl,
			placeholder: config.placeholder,
			flyTo: false,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 400,
			minLength: 2,
			showResultMarkers: false
		});
		field.appendChild(geocoder.onAdd(target));

		geocoder.on('results', (e: any) => {
			results = e.features || [];
			setTimeout(() => {
				highlight(0);
				suggestions().forEach((item, index) => {
					const select = (ev: Event) => {
						ev.preventDefault();
						ev.stopPropagation();
						if (results[index]) choose(results[index]);
					};
					item.addEventListener('touchend', select, { passive: false });
					item.addEventListener('click', select);
				});
			}, 50);
		});
		geocoder.on('result', (e: any) => choose(e.result));
		input()?.addEventListener('keydown', onKeydown, true);
	}

	async function openSearch() {
		open = true;
		await tick();
		input()?.focus();
	}

	function onFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (next && root.contains(next)) return;
		if (!input()?.value) open = false;
	}

	onDestroy(() => {
		input()?.removeEventListener('keydown', onKeydown, true);
		geocoder?.onRemove?.();
	});
</script>

<div class="search" class:open bind:this={root} on:focusout={onFocusOut}>
	<button class="ctrl-btn search-toggle" aria-label="Rechercher une adresse" aria-expanded={open} on:click={openSearch}>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
			<circle cx="11" cy="11" r="7" />
			<line x1="16.5" y1="16.5" x2="21" y2="21" />
		</svg>
	</button>
	<div class="search-field" bind:this={field}></div>
</div>

<style>
	.search {
		position: relative;
	}

	.search-toggle {
		display: none;
	}

	.search-field :global(.maplibregl-ctrl-geocoder) {
		width: min(420px, calc(100vw - 2 * var(--chrome-gap)));
		max-width: none;
		min-width: 0;
		font-family: var(--font-ui);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	.search-field :global(.suggestions) {
		z-index: 250;
	}

	@media (max-width: 640px) {
		.search-toggle {
			display: flex;
		}

		.search-field {
			display: none;
		}

		.search.open .search-toggle {
			display: none;
		}

		.search.open .search-field {
			display: block;
		}

		.search-field :global(.maplibregl-ctrl-geocoder) {
			width: calc(100vw - 2 * var(--chrome-gap));
		}
	}
</style>
