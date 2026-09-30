<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import './ui/map-chrome.css';
	import type { RegionConfig } from './regionConfig';
	import { createBaseStyle, showLabels, hideLabels, raiseLabels, orthoSource } from './regionConfig';
	import { isMapAlive, registerTileRetry, whenSourcesLoaded } from './tiles';
	import { buildYears, findOption, optionLabel, type YearOption } from './years';
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

	let wrapper: HTMLDivElement;
	let beforeContainer: HTMLDivElement;
	let afterContainer: HTMLDivElement;
	let navigationContainer: HTMLDivElement;
	let attributionContainer: HTMLDivElement;
	let beforeMap: maplibregl.Map;
	let afterMap: maplibregl.Map;
	let showStreetNames = false;
	let sliderValue = 50;
	let isDragging = false;
	let activePointerId: number | null = null;
	let vertical = false;
	let hintVisible = false;
	let loadingBefore = false;
	let loadingAfter = false;

	let beforeId = entries[0].combined.id;
	let afterId = entries[entries.length - 1].combined.id;

	$: before = findOption(entries, beforeId)!;
	$: after = findOption(entries, afterId)!;
	$: shareText = `${place[0].toUpperCase()}${place.slice(1)} vue du ciel en ${optionLabel(before)} et en ${optionLabel(after)}`;
	$: clip = vertical ? `inset(calc(${sliderValue}% - 0.5px) 0 0 0)` : `inset(0 0 0 calc(${sliderValue}% - 0.5px))`;
	$: valueText = vertical
		? `${optionLabel(before)} en haut, ${optionLabel(after)} en bas`
		: `${optionLabel(before)} à gauche, ${optionLabel(after)} à droite`;

	function repaint() {
		requestAnimationFrame(() => afterMap?.triggerRepaint());
	}

	function setSlider(value: number) {
		sliderValue = Math.max(0, Math.min(100, value));
		repaint();
	}

	function toggleStreetNames() {
		showStreetNames = !showStreetNames;
		for (const m of [beforeMap, afterMap].filter(Boolean)) {
			if (showStreetNames) showLabels(m);
			else hideLabels(m);
		}
	}

	function saveView() {
		if (!beforeMap) return;
		const center = beforeMap.getCenter();
		writeHash({ lat: center.lat, lng: center.lng, zoom: beforeMap.getZoom(), years: [beforeId, afterId] });
	}

	const activeLayerIdsByMap = new WeakMap<maplibregl.Map, Set<string>>();

	function getActiveSet(m: maplibregl.Map) {
		let s = activeLayerIdsByMap.get(m);
		if (!s) {
			s = new Set<string>();
			activeLayerIdsByMap.set(m, s);
		}
		return s;
	}

	function waitForTiles(map: maplibregl.Map, layerIds: string[], timeout = 3000, cancelOnMove = true): Promise<void> {
		return new Promise((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				map.off('idle', onIdle);
				if (cancelOnMove) map.off('movestart', finish);
				clearTimeout(timer);
				resolve();
			};
			const onIdle = () => {
				const ready = layerIds.every((lid) => {
					const srcId = lid.replace(/-layer$/, '');
					return !!map.getSource(srcId) && map.isSourceLoaded(srcId);
				});
				if (ready && map.areTilesLoaded()) finish();
			};
			const timer = setTimeout(finish, timeout);
			map.on('idle', onIdle);
			if (cancelOnMove) map.on('movestart', finish);
			onIdle();
		});
	}

	function ensureRaster(map: maplibregl.Map, ortho: YearOption['layers'][number]) {
		const layerId = `${ortho.id}-layer`;
		if (!isMapAlive(map)) return layerId;
		if (!map.getSource(ortho.id)) map.addSource(ortho.id, orthoSource(region, ortho));
		if (!map.getLayer(layerId)) {
			map.addLayer({
				id: layerId,
				type: 'raster',
				source: ortho.id,
				layout: { visibility: 'visible' },
				paint: { 'raster-opacity': 0, 'raster-fade-duration': 300 }
			});
		}
		return layerId;
	}

	const loadingCounts = new WeakMap<maplibregl.Map, number>();

	function trackLoading(map: maplibregl.Map, delta: number) {
		const count = (loadingCounts.get(map) ?? 0) + delta;
		loadingCounts.set(map, count);
		if (map === beforeMap) loadingBefore = count > 0;
		else loadingAfter = count > 0;
	}

	const pendingLayerChanges = new WeakMap<maplibregl.Map, Promise<void>>();

	async function showOption(targetMap: maplibregl.Map, option: YearOption) {
		if (!isMapAlive(targetMap)) return;
		trackLoading(targetMap, 1);

		const existing = pendingLayerChanges.get(targetMap);
		if (existing) await existing;
		if (!isMapAlive(targetMap)) return;

		const changePromise = (async () => {
			const activeSet = getActiveSet(targetMap);
			const previousIds = [...activeSet];
			const newLayerIds = option.layers.map((ortho) => ensureRaster(targetMap, ortho));

			requestAnimationFrame(() => {
				if (!isMapAlive(targetMap)) return;
				newLayerIds.forEach((lid) => {
					if (targetMap.getLayer(lid)) targetMap.moveLayer(lid);
				});
			});

			const isInteractive = targetMap === beforeMap;
			await waitForTiles(targetMap, newLayerIds, isInteractive ? 1500 : 4000, isInteractive);
			if (!isMapAlive(targetMap)) return;

			newLayerIds.forEach((lid) => {
				if (targetMap.getLayer(lid)) targetMap.setPaintProperty(lid, 'raster-opacity', 1);
			});
			activeSet.clear();
			newLayerIds.forEach((lid) => activeSet.add(lid));
			if (showStreetNames) raiseLabels(targetMap);

			const newSourceIds = option.layers.map((ortho) => ortho.id);
			const fadeDone = new Promise((resolve) => setTimeout(resolve, 400));
			Promise.all([whenSourcesLoaded(targetMap, newSourceIds), fadeDone]).then(() => {
				if (!isMapAlive(targetMap)) return;
				const current = getActiveSet(targetMap);
				previousIds.forEach((lid) => {
					if (current.has(lid)) return;
					const srcId = lid.replace(/-layer$/, '');
					if (targetMap.getLayer(lid)) targetMap.removeLayer(lid);
					if (targetMap.getSource(srcId)) targetMap.removeSource(srcId);
				});
			});
		})();

		pendingLayerChanges.set(targetMap, changePromise);
		await changePromise;
		if (pendingLayerChanges.get(targetMap) === changePromise) pendingLayerChanges.delete(targetMap);
		trackLoading(targetMap, -1);
	}

	function selectBefore(id: string) {
		beforeId = id;
		if (beforeMap) showOption(beforeMap, findOption(entries, id)!);
		saveView();
	}

	function selectAfter(id: string) {
		afterId = id;
		if (afterMap) showOption(afterMap, findOption(entries, id)!);
		saveView();
	}

	function sliderFromPointer(e: PointerEvent) {
		const rect = wrapper.getBoundingClientRect();
		setSlider(vertical ? ((e.clientY - rect.top) / rect.height) * 100 : ((e.clientX - rect.left) / rect.width) * 100);
	}

	function onHandlePointerDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		activePointerId = e.pointerId;
		isDragging = true;
	}

	function onHandlePointerMove(e: PointerEvent) {
		if (!isDragging || activePointerId !== e.pointerId || !wrapper) return;
		sliderFromPointer(e);
	}

	function onHandlePointerUp(e: PointerEvent) {
		if (activePointerId !== e.pointerId) return;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {}
		isDragging = false;
		activePointerId = null;
	}

	function onHandleKeydown(e: KeyboardEvent) {
		const steps: Record<string, number> = { ArrowLeft: -2, ArrowUp: -2, ArrowRight: 2, ArrowDown: 2, PageUp: -10, PageDown: 10 };
		if (e.key in steps) setSlider(sliderValue + steps[e.key]);
		else if (e.key === 'Home') setSlider(0);
		else if (e.key === 'End') setSlider(100);
		else return;
		e.preventDefault();
	}

	onMount(() => {
		registerTileRetry();
		let isSyncing = false;

		const initial = readHash();
		if (initial) {
			if (findOption(entries, initial.years[0])) beforeId = findOption(entries, initial.years[0])!.id;
			if (findOption(entries, initial.years[1])) afterId = findOption(entries, initial.years[1])!.id;
		}

		const position = initial
			? { center: [initial.lng, initial.lat] as [number, number], zoom: initial.zoom }
			: { bounds: region.bounds, fitBoundsOptions: { padding: region.fitBoundsPadding } };

		const common = {
			...position,
			minZoom: region.minZoom,
			maxZoom: region.maxZoom,
			maxBounds: region.maxBounds,
			attributionControl: false as const,
			renderWorldCopies: false,
			fadeDuration: 0
		};

		beforeMap = new maplibregl.Map({ ...common, container: beforeContainer, style: createBaseStyle(true) });
		afterMap = new maplibregl.Map({ ...common, container: afterContainer, style: createBaseStyle(true), interactive: false });

		const initialBefore = findOption(entries, beforeId)!;
		const initialAfter = findOption(entries, afterId)!;
		beforeMap.once('load', () => showOption(beforeMap, initialBefore));
		afterMap.once('load', () => showOption(afterMap, initialAfter));

		mountControls(beforeMap, navigationContainer, attributionContainer, region.attribution);

		beforeMap.on('move', () => {
			if (isSyncing) return;
			isSyncing = true;
			try {
				afterMap.jumpTo({
					center: beforeMap.getCenter(),
					zoom: beforeMap.getZoom(),
					bearing: beforeMap.getBearing(),
					pitch: beforeMap.getPitch()
				});
			} finally {
				Promise.resolve().then(() => (isSyncing = false));
			}
		});
		beforeMap.on('moveend', saveView);

		const observer = new ResizeObserver(() => {
			vertical = wrapper.clientHeight > wrapper.clientWidth;
			beforeMap.resize();
			afterMap.resize();
		});
		observer.observe(wrapper);

		return () => {
			observer.disconnect();
			beforeMap.remove();
			afterMap.remove();
		};
	});
</script>

<div class="timelapse" class:vertical bind:this={wrapper}>
	<div bind:this={beforeContainer} class="map-container before"></div>
	<div bind:this={afterContainer} class="map-container after" style="clip-path: {clip}"></div>

	<div class="year-slot before-slot">
		<YearSelect {entries} selectedId={beforeId} label={vertical ? 'Année en haut' : 'Année à gauche'} loading={loadingBefore} on:select={(e) => selectBefore(e.detail.id)} />
	</div>
	<div
		class="year-slot after-slot"
		style={vertical ? `top: min(calc(${sliderValue}% + 14px), calc(100% - 190px))` : ''}
	>
		<YearSelect
			{entries}
			selectedId={afterId}
			label={vertical ? 'Année en bas' : 'Année à droite'}
			align={vertical ? 'start' : 'end'}
			direction={vertical && sliderValue > 45 ? 'up' : 'down'}
			loading={loadingAfter}
			on:select={(e) => selectAfter(e.detail.id)}
		/>
	</div>

	<div class="divider" style={vertical ? `top: ${sliderValue}%` : `left: ${sliderValue}%`}>
		<div
			class="handle"
			class:nudge={hintVisible}
			role="slider"
			tabindex="0"
			aria-label="Curseur de comparaison"
			aria-orientation={vertical ? 'vertical' : 'horizontal'}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(sliderValue)}
			aria-valuetext={valueText}
			on:pointerdown={onHandlePointerDown}
			on:pointermove={onHandlePointerMove}
			on:pointerup={onHandlePointerUp}
			on:pointercancel={onHandlePointerUp}
			on:keydown={onHandleKeydown}
		>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<polyline points="9 6 3 12 9 18" />
				<polyline points="15 6 21 12 15 18" />
			</svg>
		</div>
	</div>

	<div class="chrome chrome-top-left">
		<SearchBox map={beforeMap} config={region.geocoder} />
	</div>
	<div class="chrome chrome-top-right">
		<ModeSwitcher {region} current="timelapse" />
	</div>
	<div class="chrome chrome-bottom-left">
		<StreetNamesButton pressed={showStreetNames} on:toggle={toggleStreetNames} />
		<div bind:this={navigationContainer}></div>
	</div>
	<div class="chrome chrome-bottom-right">
		<ShareButton text={shareText} />
	</div>
	<div class="chrome chrome-attribution" bind:this={attributionContainer}></div>

	<Hint text="Glissez la barre pour comparer les deux années" storageKey="hint-timelapse" bind:visible={hintVisible} />
</div>

<style>
	.timelapse {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 500px;
		overflow: hidden;
		font-family: var(--font-ui);
	}

	.map-container {
		position: absolute;
		inset: 0;
	}

	.map-container.before {
		z-index: 0;
	}

	.map-container.after {
		z-index: 1;
		pointer-events: none;
	}

	.map-container.after :global(*) {
		pointer-events: none !important;
	}

	.map-container.before :global(.maplibregl-canvas) {
		touch-action: none;
	}

	.year-slot {
		position: absolute;
		z-index: 110;
		top: calc(var(--chrome-gap) * 2 + var(--ctrl-size) + 12px);
	}

	.year-slot:has(:global(.year-select.open)) {
		z-index: 130;
	}

	.before-slot {
		left: var(--chrome-gap);
	}

	.after-slot {
		right: var(--chrome-gap);
	}

	.vertical .after-slot {
		right: auto;
		left: var(--chrome-gap);
	}

	.divider {
		position: absolute;
		z-index: 2;
		top: 0;
		bottom: 0;
		width: 3px;
		background: #fff;
		box-shadow: 0 0 6px rgba(0, 0, 0, 0.5);
		transform: translateX(-50%);
		pointer-events: none;
	}

	.vertical .divider {
		top: auto;
		bottom: auto;
		left: 0;
		right: 0;
		width: auto;
		height: 3px;
		transform: translateY(-50%);
	}

	.handle {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 48px;
		height: 48px;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: #fff;
		color: var(--ink);
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
		cursor: ew-resize;
		pointer-events: auto;
		user-select: none;
		touch-action: none;
	}

	.vertical .handle {
		cursor: ns-resize;
	}

	.vertical .handle svg {
		transform: rotate(90deg);
	}

	.handle:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	.handle.nudge {
		animation: nudge-x 1.6s ease-in-out infinite;
	}

	.vertical .handle.nudge {
		animation-name: nudge-y;
	}

	@keyframes nudge-x {
		0%,
		100% {
			transform: translate(-50%, -50%);
		}
		25% {
			transform: translate(calc(-50% - 10px), -50%);
		}
		75% {
			transform: translate(calc(-50% + 10px), -50%);
		}
	}

	@keyframes nudge-y {
		0%,
		100% {
			transform: translate(-50%, -50%);
		}
		25% {
			transform: translate(-50%, calc(-50% - 10px));
		}
		75% {
			transform: translate(-50%, calc(-50% + 10px));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.handle.nudge {
			animation: none;
		}
	}
</style>
