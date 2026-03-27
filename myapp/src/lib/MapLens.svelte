<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import type { RegionConfig } from './regionConfig';
	import { positronSource, positronLayer, labelsSource, labelsLayer } from './regionConfig';
	import { createGeocoderApi } from './geocoder';
	import ShareButtons from './ShareButtons.svelte';

	export let region: RegionConfig;

	let beforeContainer: HTMLDivElement;
	let afterContainer: HTMLDivElement;
	let beforeMap: maplibregl.Map;
	let afterMap: maplibregl.Map;
	let isSwapped = false;
	let showStreetNames = false;
	let lensRadius = 200;
	let isDraggingLens = false;
	let lensWrapper: HTMLDivElement;
	$: lensDiameter = lensRadius * 2;

	let lensPointerId: number | null = null;

	function onWrapperPointerDown(e: PointerEvent) {
		if (!lensWrapper) return;
		const rect = lensWrapper.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
		// Only start drag if pointer is near the border ring (within 18px)
		if (Math.abs(dist - lensRadius) > 18) return;
		lensWrapper.setPointerCapture(e.pointerId);
		lensPointerId = e.pointerId;
		isDraggingLens = true;
		e.preventDefault();
		e.stopPropagation();
	}

	function onWrapperPointerMove(e: PointerEvent) {
		if (!isDraggingLens || lensPointerId !== e.pointerId || !lensWrapper) return;
		const rect = lensWrapper.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
		const maxRadius = Math.min(rect.width, rect.height) / 2 - 10;
		lensRadius = Math.max(60, Math.min(maxRadius, dist));
	}

	function onWrapperPointerUp(e: PointerEvent) {
		if (isDraggingLens && lensPointerId === e.pointerId) {
			try { lensWrapper.releasePointerCapture(e.pointerId); } catch {}
			isDraggingLens = false;
			lensPointerId = null;
		}
	}

	function toggleStreetNames() {
		showStreetNames = !showStreetNames;
		const maps = [beforeMap, afterMap].filter(Boolean);
		for (const m of maps) {
			if (showStreetNames) {
				if (!m.getSource('labels')) {
					m.addSource('labels', labelsSource);
				}
				if (!m.getLayer('labels-layer')) {
					m.addLayer(labelsLayer);
				}
			} else {
				if (m.getLayer('labels-layer')) m.removeLayer('labels-layer');
				if (m.getSource('labels')) m.removeSource('labels');
			}
		}
	}

	// Track map position for sharing
	let currentCenter: { lng: number; lat: number } = { lng: region.defaultCenter.lng, lat: region.defaultCenter.lat };
	let currentZoom: number = region.defaultZoom;

	function toggleSwap() {
		isSwapped = !isSwapped;
	}

	onMount(() => {
		let isSyncing = false;

		// Parse hash for shared position (#lat,lng,zoom)
		let initialPosition: { center: [number, number]; zoom: number } | undefined = undefined;

		// Function to parse hash
		const parseHash = () => {
			if (typeof window === 'undefined') return false;

			const hash = window.location.hash.slice(1);
			if (!hash) return false;

			const parts = hash.split(',');
			if (parts.length === 3) {
				const lat = parseFloat(parts[0]);
				const lng = parseFloat(parts[1]);
				const zoom = parseFloat(parts[2].replace('z', ''));
				if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
					initialPosition = { center: [lng, lat], zoom };
					return true;
				}
			}
			return false;
		};

		// Try parsing hash with retries for production reliability
		if (!parseHash()) {
			setTimeout(() => parseHash(), 10);
		}

		// Get orthophoto configs
		const beforeOrtho = region.orthophotos.find(o => o.id === region.defaultLensBeforeId)!;
		const afterOrtho = region.orthophotos.find(o => o.id === region.defaultLensAfterId)!;

		// Setup initial position options
		const mapPositionOptions: any = initialPosition
			? { center: (initialPosition as any).center, zoom: (initialPosition as any).zoom }
			: { bounds: region.bounds, fitBoundsOptions: { padding: region.fitBoundsPadding } };

		// Build sources and layers for after map
		const afterSources: Record<string, any> = {};
		const afterLayers: any[] = [];

		if (region.hasPositronBasemap) {
			afterSources['positron'] = positronSource;
			afterLayers.push(positronLayer);
		}

		afterSources[afterOrtho.id] = {
			type: 'raster',
			tiles: [region.getTileUrl(afterOrtho)],
			tileSize: 256
		};
		afterLayers.push({
			id: `${afterOrtho.id}-layer`,
			type: 'raster',
			source: afterOrtho.id,
			paint: {}
		});

		// Build sources and layers for before map
		const beforeSources: Record<string, any> = {};
		const beforeLayers: any[] = [];

		if (region.hasPositronBasemap) {
			beforeSources['positron'] = positronSource;
			beforeLayers.push(positronLayer);
		}

		beforeSources[beforeOrtho.id] = {
			type: 'raster',
			tiles: [region.getTileUrl(beforeOrtho)],
			tileSize: 256
		};
		beforeLayers.push({
			id: `${beforeOrtho.id}-layer`,
			type: 'raster',
			source: beforeOrtho.id,
			paint: {}
		});

		// After map - visible partout
		afterMap = new maplibregl.Map({
			container: afterContainer,
			style: {
				version: 8,
				sources: afterSources,
				layers: afterLayers
			},
			...mapPositionOptions,
			minZoom: region.minZoom,
			maxZoom: region.maxZoom,
			maxBounds: region.maxBounds,
			attributionControl: false
		});

		// Before map - visible dans le cercle
		beforeMap = new maplibregl.Map({
			container: beforeContainer,
			style: {
				version: 8,
				sources: beforeSources,
				layers: beforeLayers
			},
			...mapPositionOptions,
			minZoom: region.minZoom,
			maxZoom: region.maxZoom,
			maxBounds: region.maxBounds,
			attributionControl: false
		});

		// Add error handling for tile loading
		afterMap.on('error', (e) => {
			console.warn('AfterMap tile loading error:', e);
		});

		beforeMap.on('error', (e) => {
			console.warn('BeforeMap tile loading error:', e);
		});

		// Add controls to both maps so they're always visible
		afterMap.addControl(new maplibregl.NavigationControl(), 'bottom-left');
		beforeMap.addControl(new maplibregl.NavigationControl(), 'bottom-left');

		// Add custom attribution
		afterMap.addControl(new maplibregl.AttributionControl({
			customAttribution: region.attribution
		}), 'bottom-right');

		// Add geocoder for address search to both maps
		const { api: geocoderApi, cache: geocoderCache } = createGeocoderApi(region.geocoder);

		const geocoder = new MaplibreGeocoder(geocoderApi, {
			maplibregl: maplibregl,
			placeholder: region.geocoder.placeholder,
			flyTo: false,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 400,
			minLength: 2,
			showResultMarkers: false
		});

		// Add geocoder to both maps so it's always visible
		afterMap.addControl(geocoder, 'top-left');

		const geocoder2 = new MaplibreGeocoder(geocoderApi, {
			maplibregl: maplibregl,
			placeholder: region.geocoder.placeholder,
			flyTo: false,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 400,
			minLength: 2,
			showResultMarkers: false
		});

		beforeMap.addControl(geocoder2, 'top-left');

		// Fonction pour zoomer sur un résultat
		const zoomToResult = (result: any) => {
			const bbox = result.bbox ?? result.properties?.bbox;
			if (bbox && Array.isArray(bbox) && bbox.length === 4) {
				afterMap.fitBounds(
					[
						[bbox[0], bbox[1]],
						[bbox[2], bbox[3]]
					],
					{
						padding: 50,
						maxZoom: 16,
						duration: 1200
					}
				);
			} else {
				afterMap.flyTo({ center: result.center, zoom: 15, duration: 1200 });
			}
		};

		// Amélioration UX: pré-sélectionne le premier résultat
		let currentResults: any[] = [];
		let selectedIndex = 0;

		// Capture les résultats de la recherche et pré-sélectionne le premier
		const onResults = (e: any) => {
			// Correction: l'événement expose e.features, pas e.results.features
			currentResults = e.features || [];
			selectedIndex = 0;

			// Pré-sélectionne le premier élément de la liste
			setTimeout(() => {
				const suggestions = document.querySelectorAll('.maplibregl-ctrl-geocoder .suggestions > li');
				if (suggestions.length > 0) {
					// Retire toutes les sélections actives
					suggestions.forEach((s) => s.classList.remove('active'));
					// Active le premier
					suggestions[0].classList.add('active');
				}
			}, 50);
		};

		geocoder.on('results', onResults);
		geocoder2.on('results', onResults);

		// Attendre que le geocoder soit monté
		setTimeout(() => {
			const geocoderInput = document.querySelector('.maplibregl-ctrl-geocoder input');
			if (geocoderInput) {
				// Gère les touches du clavier
				geocoderInput.addEventListener(
					'keydown',
					(e: any) => {
						const suggestions = document.querySelectorAll(
							'.maplibregl-ctrl-geocoder .suggestions > li'
						);

						if (e.key === 'Enter' && currentResults.length > 0) {
							// Empêche le comportement par défaut du geocoder
							e.preventDefault();
							e.stopPropagation();
							e.stopImmediatePropagation();

							// Zoome directement sur le résultat sélectionné
							const selectedResult = currentResults[selectedIndex];
							if (selectedResult) {
								zoomToResult(selectedResult);
								// Efface le champ
								(e.target as HTMLInputElement).value = '';
								geocoder.clear();
								currentResults = [];
							}
						} else if (e.key === 'ArrowDown' && suggestions.length > 0) {
							e.preventDefault();
							selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
							// Met à jour la classe active
							suggestions.forEach((s) => s.classList.remove('active'));
							if (suggestions[selectedIndex]) {
								suggestions[selectedIndex].classList.add('active');
							}
						} else if (e.key === 'ArrowUp' && suggestions.length > 0) {
							e.preventDefault();
							selectedIndex = Math.max(selectedIndex - 1, 0);
							// Met à jour la classe active
							suggestions.forEach((s) => s.classList.remove('active'));
							if (suggestions[selectedIndex]) {
								suggestions[selectedIndex].classList.add('active');
							}
						}
					},
					true
				); // true pour capture phase
			}
		}, 100);

		// Handle result selection via click
		const onResult = (e: any) => {
			const res = e.result;
			zoomToResult(res);

			// Efface le champ après sélection
			setTimeout(() => {
				geocoder.clear();
				geocoder2.clear();
				const inputs = document.querySelectorAll(
					'.maplibregl-ctrl-geocoder input'
				) as NodeListOf<HTMLInputElement>;
				inputs.forEach(input => input.value = '');
			}, 100);
		};

		geocoder.on('result', onResult);
		geocoder2.on('result', onResult);

		// Sync maps
		const syncMaps = (source: maplibregl.Map, target: maplibregl.Map) => {
			if (isSyncing) return;
			isSyncing = true;

			target.jumpTo({
				center: source.getCenter(),
				zoom: source.getZoom(),
				bearing: source.getBearing(),
				pitch: source.getPitch()
			});

			requestAnimationFrame(() => {
				isSyncing = false;
			});
		};

		afterMap.on('move', () => {
			if (!isSyncing) {
				syncMaps(afterMap, beforeMap);

				// Update position for share buttons and hash
				const center = afterMap.getCenter();
				currentCenter = { lng: center.lng, lat: center.lat };
				currentZoom = afterMap.getZoom();
				// Update URL hash with current position
				if (typeof window !== 'undefined') {
					window.location.hash = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${currentZoom.toFixed(2)}z`;
				}
			}
		});

		beforeMap.on('move', () => {
			if (!isSyncing) {
				syncMaps(beforeMap, afterMap);

				// Update position for share buttons and hash
				const center = beforeMap.getCenter();
				currentCenter = { lng: center.lng, lat: center.lat };
				currentZoom = beforeMap.getZoom();
				// Update URL hash with current position
				if (typeof window !== 'undefined') {
					window.location.hash = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${currentZoom.toFixed(2)}z`;
				}
			}
		});

		// Ensure maps resize properly on load and window resize
		let resizeTimeout: number | null = null;
		const handleResize = () => {
			if (resizeTimeout) return; // Already scheduled

			resizeTimeout = window.setTimeout(() => {
				if (beforeMap) beforeMap.resize();
				if (afterMap) afterMap.resize();
				resizeTimeout = null;
			}, 250);
		};

		// Initial resize after a short delay to ensure container is properly sized
		setTimeout(handleResize, 100);
		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
			beforeMap.remove();
			afterMap.remove();
		};
	});
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="map-lens-wrapper"
	bind:this={lensWrapper}
	on:pointerdown={onWrapperPointerDown}
	on:pointermove={onWrapperPointerMove}
	on:pointerup={onWrapperPointerUp}
	on:pointercancel={onWrapperPointerUp}
>
	<div bind:this={afterContainer} class="map-container after" class:lens={isSwapped} style={isSwapped ? `clip-path: circle(${lensRadius}px at center)` : ''}></div>
	<div bind:this={beforeContainer} class="map-container before" class:lens={!isSwapped} style={!isSwapped ? `clip-path: circle(${lensRadius}px at center)` : ''}></div>

	<div
		class="lens-border"
		class:dragging={isDraggingLens}
		style="width: {lensDiameter}px; height: {lensDiameter}px;"
	>
		<span class="resize-handle top">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 14 12 9 17 14"/></svg>
		</span>
		<span class="resize-handle right">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 7 15 12 10 17"/></svg>
		</span>
		<span class="resize-handle bottom">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 12 15 17 10"/></svg>
		</span>
		<span class="resize-handle left">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 7 9 12 14 17"/></svg>
		</span>
	</div>

	<div class="controls-left">
		<button class="ctrl-button" class:active={showStreetNames} on:click={toggleStreetNames} title="Noms de rues" aria-label="Afficher/masquer les noms de rues">
			<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 3v18"/>
				<path d="M6 7h8l2-2-2-2H6z" fill="currentColor" opacity="0.15"/>
				<path d="M6 7h8l2-2-2-2H6"/>
				<path d="M18 14H10l-2 2 2 2h8z" fill="currentColor" opacity="0.15"/>
				<path d="M18 14H10l-2 2 2 2h8"/>
			</svg>
		</button>
		<button class="ctrl-button" on:click={toggleSwap} title="Inverser les couches" aria-label="Inverser les couches avant/après">
			<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="17 1 21 5 17 9"></polyline>
				<path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
				<polyline points="7 23 3 19 7 15"></polyline>
				<path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
			</svg>
		</button>
	</div>

	<ShareButtons
		lat={currentCenter.lat}
		lng={currentCenter.lng}
		zoom={currentZoom}
		yearBefore={region.defaultLensBeforeId}
		yearAfter={region.defaultLensAfterId}
	/>

</div>

<style>
	/* Geocoder width */
	:global(.maplibregl-ctrl-geocoder) {
		width: 600px;
		max-width: calc(100vw - 20px);
	}

	@media (max-width: 768px) {
		:global(.maplibregl-ctrl-geocoder) {
			width: calc(100vw - 20px);
		}
	}

	.map-lens-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.map-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.map-container.lens {
		z-index: 2;
		pointer-events: none;
	}

	.map-container:not(.lens) {
		z-index: 1;
	}

	.lens-border {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		border: 3px solid white;
		border-radius: 50%;
		pointer-events: none;
		z-index: 3;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
		cursor: nwse-resize;
		touch-action: none;
	}

	.lens-border.dragging {
		border-color: #3b82f6;
		box-shadow: 0 0 16px rgba(59, 130, 246, 0.4);
	}

	.lens-border.dragging .resize-handle {
		background: #3b82f6;
		color: white;
	}

	.resize-handle {
		position: absolute;
		width: 22px;
		height: 22px;
		background: #fff;
		border-radius: 4px;
		box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		color: #333;
		cursor: nwse-resize;
	}

	.resize-handle.top {
		top: -11px;
		left: 50%;
		transform: translateX(-50%);
	}

	.resize-handle.bottom {
		bottom: -11px;
		left: 50%;
		transform: translateX(-50%);
	}

	.resize-handle.left {
		left: -11px;
		top: 50%;
		transform: translateY(-50%);
	}

	.resize-handle.right {
		right: -11px;
		top: 50%;
		transform: translateY(-50%);
	}

	.controls-left {
		position: absolute;
		bottom: 150px;
		left: 10px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.ctrl-button {
		background: #fff;
		border: none;
		width: 29px;
		height: 29px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
		transition: all 0.2s;
		color: #333;
	}

	.ctrl-button:hover {
		background: #f2f2f2;
	}

	.ctrl-button.active {
		background: #3b82f6;
		color: white;
	}

	.ctrl-button:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	/* Position controls higher to avoid attribution overlap */
	:global(.maplibregl-ctrl-bottom-left) {
		margin-bottom: 50px !important;
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.controls-left {
			bottom: 180px;
		}

		:global(.maplibregl-ctrl-bottom-left) {
			margin-bottom: 60px !important;
		}
	}
</style>
