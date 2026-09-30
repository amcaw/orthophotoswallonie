<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import './ui/map-chrome.css';
	import type { RegionConfig } from './regionConfig';
	import { createBaseStyle, showLabels, hideLabels, raiseLabels, orthoSource } from './regionConfig';
	import { isMapAlive, registerTileRetry, whenSourcesLoaded } from './tiles';
	import { buildYears, findOption, type YearEntry } from './years';
	import { readHash, writeHash } from './urlState';
	import SearchBox from './ui/SearchBox.svelte';
	import ShareButton from './ui/ShareButton.svelte';
	import ModeSwitcher from './ui/ModeSwitcher.svelte';
	import StreetNamesButton from './ui/StreetNamesButton.svelte';
	import Hint from './ui/Hint.svelte';
	import { mountControls } from './ui/controls';

	export let region: RegionConfig;

	const INTERVAL_MS = 2500;
	const FADE_MS = 1300;
	const BREAK_THRESHOLD = 30;
	const BREAK_UNITS = 4;
	const MIN_LABEL_SPACING = 44;

	const entries: YearEntry[] = buildYears(region.orthophotos);
	const place = region.name === 'brussels' ? 'Bruxelles' : 'la Wallonie';
	const lastIndex = entries.length - 1;

	const { positions, breaks } = (() => {
		const raw = [0];
		const breakAt: number[] = [];
		for (let i = 1; i < entries.length; i++) {
			const gap = entries[i].startYear - entries[i - 1].startYear;
			if (gap > BREAK_THRESHOLD) breakAt.push(i);
			raw.push(raw[i - 1] + (gap > BREAK_THRESHOLD ? BREAK_UNITS : Math.max(gap, 1)));
		}
		const total = raw[raw.length - 1] || 1;
		const pct = raw.map((value) => (value / total) * 100);
		return { positions: pct, breaks: breakAt.map((i) => (pct[i - 1] + pct[i]) / 2) };
	})();

	let wrapper: HTMLDivElement;
	let mapContainer: HTMLDivElement;
	let track: HTMLDivElement;
	let navigationContainer: HTMLDivElement;
	let attributionContainer: HTMLDivElement;
	let map: maplibregl.Map;
	let isPlaying = false;
	let currentIndex = lastIndex;
	let progress = positions[lastIndex];
	let raf: number | null = null;
	let trackWidth = 0;
	let loading = false;
	let showStreetNames = false;
	let scrubbing = false;

	$: current = entries[currentIndex];
	$: currentMeta = current.title ?? [current.combined.season, current.combined.partial ? 'zone partielle' : null].filter(Boolean).join(' · ');
	$: shareText = `${place[0].toUpperCase()}${place.slice(1)} vue du ciel en ${current.year}`;
	$: labelled = (() => {
		const pixel = (i: number) => (positions[i] / 100) * trackWidth;
		const shown = [currentIndex];
		const fits = (i: number) => shown.every((j) => Math.abs(pixel(i) - pixel(j)) >= MIN_LABEL_SPACING);
		for (const i of [0, lastIndex, ...positions.keys()]) {
			if (!shown.includes(i) && fits(i)) shown.push(i);
		}
		return new Set(shown);
	})();

	function saveView() {
		if (!map) return;
		const center = map.getCenter();
		writeHash({ lat: center.lat, lng: center.lng, zoom: map.getZoom(), years: [entries[currentIndex].id] });
	}

	function getResponsivePadding(container: HTMLElement) {
		const w = container.clientWidth || window.innerWidth;
		const h = container.clientHeight || window.innerHeight;
		const base = Math.round(Math.max(12, Math.min(w, h) * 0.03));
		return { top: base + 60, right: base + 10, bottom: base + 110, left: base + 10 };
	}

	function fitToRegion() {
		if (!map || !mapContainer) return;
		const padding = getResponsivePadding(mapContainer);
		map.resize();
		map.setMinZoom(region.getDynamicMinZoom(mapContainer.clientWidth || window.innerWidth));
		const adj = region.fitBoundsPaddingAdjust;
		map.fitBounds(region.bounds, {
			padding: { top: padding.top + adj, right: padding.right + adj, bottom: padding.bottom + adj, left: padding.left + adj },
			duration: 0
		});
	}

	function ensureLayers(entry: YearEntry, opacity: number) {
		entry.combined.layers.forEach((ortho) => {
			if (!map.getSource(ortho.id)) map.addSource(ortho.id, orthoSource(region, ortho));
			if (!map.getLayer(`${ortho.id}-layer`)) {
				map.addLayer({
					id: `${ortho.id}-layer`,
					type: 'raster',
					source: ortho.id,
					paint: {
						'raster-opacity': opacity,
						'raster-opacity-transition': { duration: 0, delay: 0 },
						'raster-fade-duration': 0
					}
				});
			}
		});
	}

	function preloadAdjacent() {
		if (!map) return;
		if (currentIndex < lastIndex) ensureLayers(entries[currentIndex + 1], 0);
		if (currentIndex > 0) ensureLayers(entries[currentIndex - 1], 0);
		if (showStreetNames) raiseLabels(map);
	}

	let generation = 0;

	function updateLayer(fadeMs = 0) {
		if (!map) return;
		const gen = ++generation;
		const entry = entries[currentIndex];
		const newLayerIds = entry.combined.layers.map((o) => `${o.id}-layer`);
		const oldLayerIds = (map.getStyle()?.layers ?? [])
			.map((l) => l.id)
			.filter((id) => id.endsWith('-layer') && !newLayerIds.includes(id));

		loading = true;
		ensureLayers(entry, 0);
		newLayerIds.forEach((lid) => map.getLayer(lid) && map.moveLayer(lid));
		if (showStreetNames) raiseLabels(map);

		const removeOld = (delayMs: number) => {
			const fadeDone = new Promise((resolve) => setTimeout(resolve, delayMs));
			Promise.all([whenSourcesLoaded(map, entry.combined.layers.map((o) => o.id)), fadeDone]).then(() => {
				if (!map || !isMapAlive(map)) return;
				const keep = entries[currentIndex].combined.layers.map((o) => `${o.id}-layer`);
				oldLayerIds.forEach((lid) => {
					if (keep.includes(lid) || !map.getLayer(lid)) return;
					map.removeLayer(lid);
					const srcId = lid.replace(/-layer$/, '');
					if (map.getSource(srcId)) map.removeSource(srcId);
				});
			});
		};

		let shown = false;
		const show = () => {
			if (shown || gen !== generation || !map) return;
			shown = true;
			map.off('sourcedata', onSourceData);
			loading = false;
			newLayerIds.forEach((lid) => {
				if (!map.getLayer(lid)) return;
				map.setPaintProperty(lid, 'raster-opacity-transition', { duration: fadeMs, delay: 0 });
				map.setPaintProperty(lid, 'raster-opacity', 1);
			});
			removeOld(fadeMs + 50);
		};
		const onSourceData = () => {
			if (entry.combined.layers.every((o) => map.getSource(o.id) && map.isSourceLoaded(o.id))) show();
		};
		map.on('sourcedata', onSourceData);
		setTimeout(show, fadeMs > 0 ? Math.max(fadeMs, 1500) : 500);
	}

	function stopAnimation() {
		isPlaying = false;
		if (raf) cancelAnimationFrame(raf);
		raf = null;
	}

	function goTo(index: number, fadeMs = 0) {
		stopAnimation();
		const target = Math.max(0, Math.min(lastIndex, index));
		progress = positions[target];
		if (target === currentIndex) return;
		currentIndex = target;
		updateLayer(fadeMs);
		preloadAdjacent();
		saveView();
	}

	function play() {
		if (!map) return;
		if (currentIndex === lastIndex) goTo(0);
		isPlaying = true;
		preloadAdjacent();
		let last = performance.now();
		let fraction = 0;
		const step = (now: number) => {
			if (!isPlaying) return;
			fraction += (now - last) / INTERVAL_MS;
			last = now;
			if (fraction >= 1) {
				fraction = 0;
				currentIndex += 1;
				updateLayer(FADE_MS);
				preloadAdjacent();
				saveView();
				if (currentIndex === lastIndex) {
					progress = positions[lastIndex];
					stopAnimation();
					return;
				}
			}
			progress = positions[currentIndex] + (positions[currentIndex + 1] - positions[currentIndex]) * fraction;
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
	}

	function togglePlay() {
		if (isPlaying) goTo(currentIndex);
		else play();
	}

	function indexAt(clientX: number) {
		const rect = track.getBoundingClientRect();
		const pct = ((clientX - rect.left) / rect.width) * 100;
		let best = 0;
		positions.forEach((pos, i) => {
			if (Math.abs(pos - pct) < Math.abs(positions[best] - pct)) best = i;
		});
		return best;
	}

	function onTrackPointerDown(e: PointerEvent) {
		track.setPointerCapture(e.pointerId);
		scrubbing = true;
		goTo(indexAt(e.clientX));
	}

	function onTrackPointerMove(e: PointerEvent) {
		if (!scrubbing) return;
		const index = indexAt(e.clientX);
		if (index !== currentIndex) goTo(index);
	}

	function onTrackPointerUp(e: PointerEvent) {
		scrubbing = false;
		try {
			track.releasePointerCapture(e.pointerId);
		} catch {}
	}

	function onTrackKeydown(e: KeyboardEvent) {
		const moves: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
		if (e.key in moves) goTo(currentIndex + moves[e.key]);
		else if (e.key === 'Home') goTo(0);
		else if (e.key === 'End') goTo(lastIndex);
		else return;
		e.preventDefault();
	}

	function onWindowKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (e.key !== ' ' || target.closest('input, textarea, button, a, [role="slider"]')) return;
		e.preventDefault();
		togglePlay();
	}

	function toggleStreetNames() {
		showStreetNames = !showStreetNames;
		if (!map) return;
		if (showStreetNames) showLabels(map);
		else hideLabels(map);
	}

	onMount(() => {
		registerTileRetry();

		const initial = readHash();
		const initialOption = findOption(entries, initial?.years[0]);
		if (initialOption) {
			currentIndex = entries.findIndex((entry) => entry.year === initialOption.year);
			progress = positions[currentIndex];
		}

		const style = createBaseStyle(false);
		for (const ortho of entries[currentIndex].combined.layers) {
			style.sources[ortho.id] = orthoSource(region, ortho);
			style.layers.push({
				id: `${ortho.id}-layer`,
				type: 'raster',
				source: ortho.id,
				paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 }
			});
		}

		map = new maplibregl.Map({
			container: mapContainer,
			style,
			...(initial ? { center: [initial.lng, initial.lat] as [number, number], zoom: initial.zoom } : {}),
			maxZoom: region.maxZoom,
			minZoom: region.minZoom,
			maxBounds: region.maxBounds,
			canvasContextAttributes: { preserveDrawingBuffer: true },
			attributionControl: false
		});

		mountControls(map, navigationContainer, attributionContainer, region.attribution);

		map.on('moveend', saveView);
		map.once('idle', () => {
			if (!initial) fitToRegion();
		});

		let lastSize = `${mapContainer.clientWidth}x${mapContainer.clientHeight}`;
		const observer = new ResizeObserver(() => {
			trackWidth = track?.clientWidth ?? 0;
			const size = `${mapContainer.clientWidth}x${mapContainer.clientHeight}`;
			if (size === lastSize) return;
			lastSize = size;
			if (initial) map.resize();
			else fitToRegion();
		});
		observer.observe(wrapper);
		trackWidth = track.clientWidth;

		return () => {
			stopAnimation();
			observer.disconnect();
			map.remove();
		};
	});
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div class="travel" bind:this={wrapper}>
	<div class="map-container" bind:this={mapContainer}></div>

	<div class="year-overlay" class:loading aria-live="polite">
		<span class="year">{current.year}</span>
		{#if currentMeta}<span class="meta">{currentMeta}</span>{/if}
	</div>

	<div class="chrome chrome-top-left">
		<SearchBox {map} config={region.geocoder} />
	</div>
	<div class="chrome chrome-top-right">
		<ModeSwitcher {region} current="traveltime" />
	</div>
	<div class="chrome chrome-bottom-left">
		<StreetNamesButton pressed={showStreetNames} on:toggle={toggleStreetNames} />
		<div bind:this={navigationContainer}></div>
	</div>
	<div class="chrome chrome-bottom-right">
		<ShareButton text={shareText} />
	</div>
	<div class="chrome chrome-attribution" bind:this={attributionContainer}></div>

	<div class="playbar">
		<div class="buttons">
			<button class="ctrl-btn" aria-label="Année précédente" disabled={currentIndex === 0} on:click={() => goTo(currentIndex - 1)}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18" /></svg>
			</button>
			<button class="ctrl-btn play" aria-label={isPlaying ? 'Pause' : currentIndex === lastIndex ? 'Revoir depuis le début' : 'Lecture'} on:click={togglePlay}>
				{#if isPlaying}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
				{:else if currentIndex === lastIndex}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></svg>
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6,4 20,12 6,20" /></svg>
				{/if}
			</button>
			<button class="ctrl-btn" aria-label="Année suivante" disabled={currentIndex === lastIndex} on:click={() => goTo(currentIndex + 1)}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
			</button>
		</div>

		<div
			class="timeline"
			bind:this={track}
			role="slider"
			tabindex="0"
			aria-label="Année affichée"
			aria-valuemin={entries[0].startYear}
			aria-valuemax={entries[lastIndex].startYear}
			aria-valuenow={current.startYear}
			aria-valuetext={current.year}
			on:pointerdown={onTrackPointerDown}
			on:pointermove={onTrackPointerMove}
			on:pointerup={onTrackPointerUp}
			on:pointercancel={onTrackPointerUp}
			on:keydown={onTrackKeydown}
		>
			<div class="track">
				<div class="progress" style="width: {progress}%"></div>
			</div>
			{#each breaks as position}
				<span class="break" style="left: {position}%" aria-hidden="true"></span>
			{/each}
			{#each entries as entry, i}
				<span class="tick" class:active={i === currentIndex} class:past={i < currentIndex} style="left: {positions[i]}%" aria-hidden="true">
					{#if labelled.has(i)}<span class="tick-label" class:first={i === 0} class:last={i === lastIndex}>{entry.year.split('-')[0]}</span>{/if}
				</span>
			{/each}
		</div>
	</div>

	<Hint text="Appuyez sur lecture ou glissez sur la frise pour changer d'année" storageKey="hint-traveltime" />
</div>

<style>
	.travel {
		--chrome-bottom: 112px;
		position: relative;
		width: 100%;
		height: 100%;
		min-height: min(500px, 100dvh);
		overflow: hidden;
		font-family: var(--font-ui);
	}

	.map-container {
		position: absolute;
		inset: 0;
	}

	.year-overlay {
		position: absolute;
		z-index: 10;
		top: calc(var(--chrome-gap) * 2 + var(--ctrl-size) + 12px);
		left: var(--chrome-gap);
		display: flex;
		flex-direction: column;
		color: #fff;
		text-shadow: var(--year-shadow);
		pointer-events: none;
		line-height: 1;
	}

	.year-overlay .year {
		font-size: clamp(32px, 7vw, 56px);
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.year-overlay .meta {
		margin-top: 6px;
		font-size: 14px;
	}

	.year-overlay.loading .year {
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.55;
		}
	}

	.playbar {
		position: absolute;
		z-index: 100;
		left: var(--chrome-gap);
		right: var(--chrome-gap);
		bottom: 28px;
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 12px 16px;
		border-radius: 8px;
		background: var(--overlay);
		color: #fff;
	}

	.buttons {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}

	.buttons .ctrl-btn {
		box-shadow: none;
	}

	.buttons .ctrl-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.buttons .play {
		background: var(--accent);
		color: #fff;
	}

	.timeline {
		position: relative;
		flex: 1;
		height: 40px;
		cursor: pointer;
		touch-action: none;
	}

	.timeline:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
		border-radius: 4px;
	}

	.track {
		position: absolute;
		left: 0;
		right: 0;
		top: 10px;
		height: 4px;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.25);
	}

	.progress {
		height: 100%;
		border-radius: 2px;
		background: var(--accent);
	}

	.break {
		position: absolute;
		top: 4px;
		width: 6px;
		height: 16px;
		transform: translateX(-50%) skewX(-20deg);
		background: var(--overlay);
		border-left: 1px solid rgba(255, 255, 255, 0.6);
		border-right: 1px solid rgba(255, 255, 255, 0.6);
	}

	.tick {
		position: absolute;
		top: 6px;
		width: 2px;
		height: 12px;
		transform: translateX(-50%);
		background: rgba(255, 255, 255, 0.5);
	}

	.tick.past {
		background: rgba(255, 255, 255, 0.8);
	}

	.tick.active {
		top: 2px;
		width: 12px;
		height: 20px;
		border-radius: 3px;
		background: #fff;
	}

	.tick-label {
		position: absolute;
		top: 22px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		color: rgba(255, 255, 255, 0.7);
		white-space: nowrap;
	}

	.tick-label.first {
		left: 0;
		transform: none;
	}

	.tick-label.last {
		left: auto;
		right: 0;
		transform: none;
	}

	.tick.active .tick-label {
		top: 26px;
		color: #fff;
		font-weight: 700;
	}

	@media (max-width: 640px) {
		.playbar {
			gap: 12px;
			padding: 10px 12px;
		}
	}
</style>
