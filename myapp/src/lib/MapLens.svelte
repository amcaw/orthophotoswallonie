<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import './ui/map-chrome.css';
	import type { RegionConfig } from './regionConfig';
	import { createBaseStyle, showLabels, hideLabels, raiseLabels, orthoSource } from './regionConfig';
	import { isMapAlive, registerTileRetry, whenSourcesLoaded } from './tiles';
	import { buildYears, findOption, layerIds, optionLabel, type YearOption } from './years';
	import { readHash, writeHash } from './urlState';
	import YearSelect from './ui/YearSelect.svelte';
	import SearchBox from './ui/SearchBox.svelte';
	import ShareButton from './ui/ShareButton.svelte';
	import ModeSwitcher from './ui/ModeSwitcher.svelte';
	import StreetNamesButton from './ui/StreetNamesButton.svelte';
	import Hint from './ui/Hint.svelte';
	import { mountControls } from './ui/controls';

	export let region: RegionConfig;

	const entries = buildYears(region.orthophotos);
	const place = region.name === 'brussels' ? 'Bruxelles' : 'la Wallonie';
	const MIN_RADIUS = 60;

	let beforeId = findOption(entries, region.defaultLensBeforeId)?.id ?? entries[0].combined.id;
	let afterId = findOption(entries, region.defaultLensAfterId)?.id ?? entries[entries.length - 1].combined.id;

	let wrapper: HTMLDivElement;
	let beforeContainer: HTMLDivElement;
	let afterContainer: HTMLDivElement;
	let navigationContainer: HTMLDivElement;
	let attributionContainer: HTMLDivElement;
	let beforeMap: maplibregl.Map;
	let afterMap: maplibregl.Map;
	let isSwapped = false;
	let showStreetNames = false;
	let lensRadius = 150;
	let isDraggingLens = false;
	let lensPointerId: number | null = null;
	let loadingBefore = false;
	let loadingAfter = false;

	$: before = findOption(entries, beforeId)!;
	$: after = findOption(entries, afterId)!;
	$: lensDiameter = lensRadius * 2;
	$: mask = `radial-gradient(circle ${lensRadius}px at center, transparent ${lensRadius - 0.5}px, black ${lensRadius + 0.5}px)`;
	$: maskStyle = `-webkit-mask-image: ${mask}; mask-image: ${mask};`;
	$: shareText = `${place[0].toUpperCase()}${place.slice(1)} vue du ciel en ${optionLabel(before)} et en ${optionLabel(after)}`;

	function maxRadius() {
		const w = wrapper?.clientWidth ?? window.innerWidth;
		const h = wrapper?.clientHeight ?? window.innerHeight;
		return Math.max(MIN_RADIUS, Math.min(w / 2 - 12, h / 2 - 72));
	}

	function fitLens(initial = false) {
		const w = wrapper.clientWidth;
		const h = wrapper.clientHeight;
		const target = initial ? Math.min(w, h) * 0.35 : lensRadius;
		lensRadius = Math.max(MIN_RADIUS, Math.min(maxRadius(), target));
	}

	function ringTolerance() {
		return window.matchMedia('(pointer: coarse)').matches ? 28 : 18;
	}

	function distanceFromCenter(e: PointerEvent) {
		const rect = wrapper.getBoundingClientRect();
		return Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
	}

	function onWrapperPointerDown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest('.lens-label, .chrome')) return;
		if (Math.abs(distanceFromCenter(e) - lensRadius) > ringTolerance()) return;
		lensPointerId = e.pointerId;
		isDraggingLens = true;
		e.preventDefault();
		e.stopPropagation();
		window.addEventListener('pointermove', onWindowPointerMove);
		window.addEventListener('pointerup', onWindowPointerUp);
		window.addEventListener('pointercancel', onWindowPointerUp);
	}

	function onWindowPointerMove(e: PointerEvent) {
		if (!isDraggingLens || lensPointerId !== e.pointerId) return;
		lensRadius = Math.max(MIN_RADIUS, Math.min(maxRadius(), distanceFromCenter(e)));
	}

	function onWindowPointerUp(e: PointerEvent) {
		if (!isDraggingLens || lensPointerId !== e.pointerId) return;
		isDraggingLens = false;
		lensPointerId = null;
		window.removeEventListener('pointermove', onWindowPointerMove);
		window.removeEventListener('pointerup', onWindowPointerUp);
		window.removeEventListener('pointercancel', onWindowPointerUp);
	}

	function toggleStreetNames() {
		showStreetNames = !showStreetNames;
		for (const m of [beforeMap, afterMap].filter(Boolean)) {
			if (showStreetNames) showLabels(m);
			else hideLabels(m);
		}
	}

	function saveView() {
		if (!afterMap) return;
		const center = afterMap.getCenter();
		writeHash({ lat: center.lat, lng: center.lng, zoom: afterMap.getZoom(), years: [beforeId, afterId] });
	}

	const loadingCounts = new WeakMap<maplibregl.Map, number>();

	function trackLoading(map: maplibregl.Map, delta: number) {
		const count = (loadingCounts.get(map) ?? 0) + delta;
		loadingCounts.set(map, count);
		if (map === beforeMap) loadingBefore = count > 0;
		else loadingAfter = count > 0;
	}

	function swapMapLayer(map: maplibregl.Map, option: YearOption) {
		const newLayerIds = layerIds(option);
		const oldLayerIds = (map.getStyle()?.layers ?? [])
			.map((l) => l.id)
			.filter((id) => id.endsWith('-layer') && !newLayerIds.includes(id));

		option.layers.forEach((ortho) => {
			const layerId = `${ortho.id}-layer`;
			if (!map.getSource(ortho.id)) map.addSource(ortho.id, orthoSource(region, ortho));
			if (map.getLayer(layerId)) map.moveLayer(layerId);
			else map.addLayer({ id: layerId, type: 'raster', source: ortho.id, paint: {} });
		});
		if (showStreetNames) raiseLabels(map);

		trackLoading(map, 1);
		whenSourcesLoaded(map, option.layers.map((ortho) => ortho.id)).then(() => {
			trackLoading(map, -1);
			if (!isMapAlive(map)) return;
			const selected = findOption(entries, map === beforeMap ? beforeId : afterId);
			const keep = selected ? layerIds(selected) : newLayerIds;
			for (const id of oldLayerIds) {
				if (keep.includes(id) || !map.getLayer(id)) continue;
				map.removeLayer(id);
				const srcId = id.replace(/-layer$/, '');
				if (map.getSource(srcId)) map.removeSource(srcId);
			}
		});
	}

	function selectBefore(id: string) {
		beforeId = id;
		if (beforeMap) swapMapLayer(beforeMap, findOption(entries, id)!);
		saveView();
	}

	function selectAfter(id: string) {
		afterId = id;
		if (afterMap) swapMapLayer(afterMap, findOption(entries, id)!);
		saveView();
	}

	function styleWith(option: YearOption) {
		const style = createBaseStyle(region.hasPositronBasemap);
		for (const ortho of option.layers) {
			style.sources[ortho.id] = orthoSource(region, ortho);
			style.layers.push({ id: `${ortho.id}-layer`, type: 'raster', source: ortho.id, paint: {} });
		}
		return style;
	}

	onMount(() => {
		registerTileRetry();
		let isSyncing = false;

		const initial = readHash();
		if (initial) {
			if (findOption(entries, initial.years[0])) beforeId = findOption(entries, initial.years[0])!.id;
			if (findOption(entries, initial.years[1])) afterId = findOption(entries, initial.years[1])!.id;
		}
		fitLens(true);

		const position = initial
			? { center: [initial.lng, initial.lat] as [number, number], zoom: initial.zoom }
			: { bounds: region.bounds, fitBoundsOptions: { padding: region.fitBoundsPadding } };
		const common = {
			...position,
			minZoom: region.minZoom,
			maxZoom: region.maxZoom,
			maxBounds: region.maxBounds,
			attributionControl: false as const
		};

		afterMap = new maplibregl.Map({ ...common, container: afterContainer, style: styleWith(findOption(entries, afterId)!) });
		beforeMap = new maplibregl.Map({ ...common, container: beforeContainer, style: styleWith(findOption(entries, beforeId)!) });

		mountControls(afterMap, navigationContainer, attributionContainer, region.attribution);

		const sync = (source: maplibregl.Map, target: maplibregl.Map) => {
			if (isSyncing) return;
			isSyncing = true;
			target.jumpTo({
				center: source.getCenter(),
				zoom: source.getZoom(),
				bearing: source.getBearing(),
				pitch: source.getPitch()
			});
			requestAnimationFrame(() => (isSyncing = false));
		};

		afterMap.on('move', () => sync(afterMap, beforeMap));
		beforeMap.on('move', () => sync(beforeMap, afterMap));
		afterMap.on('moveend', saveView);
		beforeMap.on('moveend', saveView);

		wrapper.addEventListener('pointerdown', onWrapperPointerDown, true);

		const observer = new ResizeObserver(() => {
			fitLens();
			beforeMap.resize();
			afterMap.resize();
		});
		observer.observe(wrapper);

		return () => {
			observer.disconnect();
			wrapper.removeEventListener('pointerdown', onWrapperPointerDown, true);
			window.removeEventListener('pointermove', onWindowPointerMove);
			window.removeEventListener('pointerup', onWindowPointerUp);
			window.removeEventListener('pointercancel', onWindowPointerUp);
			beforeMap.remove();
			afterMap.remove();
		};
	});
</script>

<div class="lens-wrapper" bind:this={wrapper}>
	<div
		bind:this={beforeContainer}
		class="map-container"
		class:lens-layer={!isSwapped}
		class:bg-layer={isSwapped}
		style={isSwapped ? maskStyle : ''}
	></div>
	<div
		bind:this={afterContainer}
		class="map-container"
		class:bg-layer={!isSwapped}
		class:lens-layer={isSwapped}
		style={!isSwapped ? maskStyle : ''}
	></div>

	<div class="lens-border" class:dragging={isDraggingLens} style="width: {lensDiameter}px; height: {lensDiameter}px;">
		<span class="resize-handle top"></span>
		<span class="resize-handle right"></span>
		<span class="resize-handle bottom"></span>
		<span class="resize-handle left"></span>
	</div>

	<div class="lens-label" style="top: calc(50% - {lensRadius}px + 12px)">
		{#if isSwapped}
			<YearSelect {entries} selectedId={afterId} label="Année dans la loupe" variant="pill" align="center" loading={loadingAfter} on:select={(e) => selectAfter(e.detail.id)} />
		{:else}
			<YearSelect {entries} selectedId={beforeId} label="Année dans la loupe" variant="pill" align="center" loading={loadingBefore} on:select={(e) => selectBefore(e.detail.id)} />
		{/if}
	</div>

	<div class="lens-label" style="top: calc(50% + {lensRadius}px + 12px)">
		{#if isSwapped}
			<YearSelect {entries} selectedId={beforeId} label="Année autour de la loupe" variant="pill" align="center" direction="up" loading={loadingBefore} on:select={(e) => selectBefore(e.detail.id)} />
		{:else}
			<YearSelect {entries} selectedId={afterId} label="Année autour de la loupe" variant="pill" align="center" direction="up" loading={loadingAfter} on:select={(e) => selectAfter(e.detail.id)} />
		{/if}
	</div>

	<div class="chrome chrome-top-left">
		<SearchBox map={afterMap} config={region.geocoder} />
	</div>
	<div class="chrome chrome-top-right">
		<ModeSwitcher {region} current="lens" />
	</div>
	<div class="chrome chrome-bottom-left">
		<StreetNamesButton pressed={showStreetNames} on:toggle={toggleStreetNames} />
		<button class="ctrl-btn" aria-pressed={isSwapped} aria-label="Inverser la loupe et le fond" title="Inverser" on:click={() => (isSwapped = !isSwapped)}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<polyline points="17 1 21 5 17 9" />
				<path d="M3 11V9a4 4 0 0 1 4-4h14" />
				<polyline points="7 23 3 19 7 15" />
				<path d="M21 13v2a4 4 0 0 1-4 4H3" />
			</svg>
		</button>
		<div bind:this={navigationContainer}></div>
	</div>
	<div class="chrome chrome-bottom-right">
		<ShareButton text={shareText} />
	</div>
	<div class="chrome chrome-attribution" bind:this={attributionContainer}></div>

	<Hint text="Déplacez la carte sous la loupe. Tirez son bord pour l'agrandir." storageKey="hint-lens" />
</div>

<style>
	.lens-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		font-family: var(--font-ui);
	}

	.map-container {
		position: absolute;
		inset: 0;
	}

	.map-container.lens-layer {
		z-index: 1;
	}

	.map-container.bg-layer {
		z-index: 2;
	}

	.lens-border {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 3;
		transform: translate(-50%, -50%);
		border: 3px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 8px rgba(0, 0, 0, 0.35);
		pointer-events: none;
	}

	.lens-border.dragging {
		border-color: var(--accent);
	}

	.resize-handle {
		position: absolute;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.2);
	}

	.dragging .resize-handle {
		background: var(--accent);
	}

	.resize-handle.top {
		top: -7.5px;
		left: calc(50% - 6px);
	}

	.resize-handle.bottom {
		bottom: -7.5px;
		left: calc(50% - 6px);
	}

	.resize-handle.left {
		left: -7.5px;
		top: calc(50% - 6px);
	}

	.resize-handle.right {
		right: -7.5px;
		top: calc(50% - 6px);
	}

	.lens-label {
		position: absolute;
		left: 50%;
		z-index: 110;
		transform: translateX(-50%);
	}
</style>
