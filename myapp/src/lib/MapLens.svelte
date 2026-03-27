<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import type { RegionConfig, OrthoGroup } from './regionConfig';
	import { positronSource, positronLayer, labelsSource, labelsLayer, groupOrthophotos } from './regionConfig';
	import { createGeocoderApi } from './geocoder';
	import ShareButtons from './ShareButtons.svelte';
	import Tutorial from './Tutorial.svelte';

	export let region: RegionConfig;

	const tutorialSteps = [
		{ selector: '.maplibregl-ctrl-geocoder', text: 'Recherchez une adresse ou un lieu pour naviguer rapidement sur la carte.', position: 'bottom' as const },
		{ selector: '.maplibregl-ctrl-group', text: 'Utilisez ces boutons pour zoomer et dézoomer sur la carte.', position: 'right' as const },
		{ selector: '.lens-border', text: 'Glissez les bords de la loupe pour agrandir ou réduire la zone de comparaison.', position: 'top' as const },
		{ selector: '.lens-year-label.inside', text: 'Cliquez pour choisir l\'année affichée dans la loupe.', position: 'bottom' as const },
		{ selector: '.lens-year-label.outside', text: 'Cliquez pour choisir l\'année affichée en arrière-plan.', position: 'bottom' as const },
		{ selector: '.controls-left .ctrl-button:last-child', text: 'Inversez les couches : échangez l\'année de la loupe et de l\'arrière-plan.', position: 'right' as const },
		{ selector: '.controls-left .ctrl-button:first-child', text: 'Activez l\'affichage des noms de rues par-dessus les photos aériennes.', position: 'right' as const },
	];

	// Year groups for selection
	const groupedOrthos: OrthoGroup[] = groupOrthophotos(region.orthophotos);

	// Current selected year group IDs
	let selectedBeforeGroupId = groupedOrthos.find(g => g.layers.some(l => l.id === region.defaultLensBeforeId))?.id || groupedOrthos[0].id;
	let selectedAfterGroupId = groupedOrthos.find(g => g.layers.some(l => l.id === region.defaultLensAfterId))?.id || groupedOrthos[groupedOrthos.length - 1].id;

	// Dropdown open state
	let showBeforeDropdown = false;
	let showAfterDropdown = false;

	$: selectedBeforeGroup = groupedOrthos.find(g => g.id === selectedBeforeGroupId)!;
	$: selectedAfterGroup = groupedOrthos.find(g => g.id === selectedAfterGroupId)!;

	// Labels depend on swap state
	$: lensYearLabel = isSwapped ? selectedAfterGroup.displayYear : selectedBeforeGroup.displayYear;
	$: bgYearLabel = isSwapped ? selectedBeforeGroup.displayYear : selectedAfterGroup.displayYear;

	function changeBeforeYear(groupId: string) {
		if (groupId === selectedBeforeGroupId) { showBeforeDropdown = false; return; }
		selectedBeforeGroupId = groupId;
		showBeforeDropdown = false;
		const group = groupedOrthos.find(g => g.id === groupId)!;
		if (!beforeMap) return;
		// Replace layer on beforeMap
		swapMapLayer(beforeMap, group);
	}

	function changeAfterYear(groupId: string) {
		if (groupId === selectedAfterGroupId) { showAfterDropdown = false; return; }
		selectedAfterGroupId = groupId;
		showAfterDropdown = false;
		const group = groupedOrthos.find(g => g.id === groupId)!;
		if (!afterMap) return;
		// Replace layer on afterMap
		swapMapLayer(afterMap, group);
	}

	function swapMapLayer(map: maplibregl.Map, group: OrthoGroup) {
		// Remove old ortho layers/sources (keep positron and labels)
		const style = map.getStyle();
		if (style?.layers) {
			for (const l of style.layers) {
				if (l.id.endsWith('-layer') && l.id !== 'labels-layer' && l.id !== 'positron-layer') {
					map.removeLayer(l.id);
					const srcId = l.id.replace(/-layer$/, '');
					if (map.getSource(srcId)) map.removeSource(srcId);
				}
			}
		}
		// Add new layers
		group.layers.forEach(ortho => {
			if (!map.getSource(ortho.id)) {
				map.addSource(ortho.id, {
					type: 'raster',
					tiles: [region.getTileUrl(ortho)],
					tileSize: 256
				});
			}
			if (!map.getLayer(`${ortho.id}-layer`)) {
				map.addLayer({
					id: `${ortho.id}-layer`,
					type: 'raster',
					source: ortho.id,
					paint: {}
				});
			}
		});
		// Keep labels on top
		if (showStreetNames && map.getLayer('labels-layer')) {
			map.moveLayer('labels-layer');
		}
	}

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
		lensPointerId = e.pointerId;
		isDraggingLens = true;
		e.preventDefault();
		e.stopPropagation();
		// Use window-level listeners so we never miss pointerup
		window.addEventListener('pointermove', onWindowPointerMove);
		window.addEventListener('pointerup', onWindowPointerUp);
		window.addEventListener('pointercancel', onWindowPointerUp);
	}

	function onWindowPointerMove(e: PointerEvent) {
		if (!isDraggingLens || lensPointerId !== e.pointerId || !lensWrapper) return;
		const rect = lensWrapper.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
		const maxRadius = Math.min(rect.width, rect.height) / 2 - 10;
		lensRadius = Math.max(60, Math.min(maxRadius, dist));
	}

	function onWindowPointerUp(e: PointerEvent) {
		if (isDraggingLens && lensPointerId === e.pointerId) {
			isDraggingLens = false;
			lensPointerId = null;
			window.removeEventListener('pointermove', onWindowPointerMove);
			window.removeEventListener('pointerup', onWindowPointerUp);
			window.removeEventListener('pointercancel', onWindowPointerUp);
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

	// Close dropdowns on outside click
	function handleWindowClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.lens-year-label')) {
			showBeforeDropdown = false;
			showAfterDropdown = false;
		}
	}

	onMount(() => {
		window.addEventListener('click', handleWindowClick);
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

		// Get initial orthophoto groups
		const beforeGroup = groupedOrthos.find(g => g.id === selectedBeforeGroupId)!;
		const afterGroup = groupedOrthos.find(g => g.id === selectedAfterGroupId)!;

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

		afterGroup.layers.forEach(ortho => {
			afterSources[ortho.id] = {
				type: 'raster',
				tiles: [region.getTileUrl(ortho)],
				tileSize: 256
			};
			afterLayers.push({
				id: `${ortho.id}-layer`,
				type: 'raster',
				source: ortho.id,
				paint: {}
			});
		});

		// Build sources and layers for before map
		const beforeSources: Record<string, any> = {};
		const beforeLayers: any[] = [];

		if (region.hasPositronBasemap) {
			beforeSources['positron'] = positronSource;
			beforeLayers.push(positronLayer);
		}

		beforeGroup.layers.forEach(ortho => {
			beforeSources[ortho.id] = {
				type: 'raster',
				tiles: [region.getTileUrl(ortho)],
				tileSize: 256
			};
			beforeLayers.push({
				id: `${ortho.id}-layer`,
				type: 'raster',
				source: ortho.id,
				paint: {}
			});
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
			window.removeEventListener('click', handleWindowClick);
			window.removeEventListener('pointermove', onWindowPointerMove);
			window.removeEventListener('pointerup', onWindowPointerUp);
			window.removeEventListener('pointercancel', onWindowPointerUp);
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

	<!-- Year label INSIDE lens (near top edge of circle) -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="lens-year-label inside"
		style="top: calc(50% - {lensRadius - 30}px)"
		on:click|stopPropagation={() => { showBeforeDropdown = !showBeforeDropdown; showAfterDropdown = false; }}
		on:keydown={(e) => e.key === 'Enter' && (showBeforeDropdown = !showBeforeDropdown)}
		role="button" tabindex="0"
	>
		{lensYearLabel}
		<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
		{#if showBeforeDropdown}
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="year-dropdown" on:click|stopPropagation>
				{#each groupedOrthos as group}
					<button
						class="year-option"
						class:selected={group.id === (isSwapped ? selectedAfterGroupId : selectedBeforeGroupId)}
						on:click={() => isSwapped ? changeAfterYear(group.id) : changeBeforeYear(group.id)}
					>{group.displayYear}</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Year label OUTSIDE lens (below bottom edge of circle) -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="lens-year-label outside"
		style="top: calc(50% + {lensRadius + 10}px)"
		on:click|stopPropagation={() => { showAfterDropdown = !showAfterDropdown; showBeforeDropdown = false; }}
		on:keydown={(e) => e.key === 'Enter' && (showAfterDropdown = !showAfterDropdown)}
		role="button" tabindex="0"
	>
		{bgYearLabel}
		<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
		{#if showAfterDropdown}
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="year-dropdown up" on:click|stopPropagation>
				{#each groupedOrthos as group}
					<button
						class="year-option"
						class:selected={group.id === (isSwapped ? selectedBeforeGroupId : selectedAfterGroupId)}
						on:click={() => isSwapped ? changeBeforeYear(group.id) : changeAfterYear(group.id)}
					>{group.displayYear}</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="controls-left">
		<button class="ctrl-button" class:active={showStreetNames} on:click={toggleStreetNames} title="Noms de rues" aria-label="Afficher/masquer les noms de rues">
			<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 640 640" fill="currentColor">
				<path d="M320.4 64C302.7 64 288.4 78.3 288.4 96L288.4 128L128.4 128C110.7 128 96.4 142.3 96.4 160L96.4 224C96.4 241.7 110.7 256 128.4 256L288.4 256L288.4 320L135 320C130.8 320 126.7 321.7 123.7 324.7L75.7 372.7C69.5 378.9 69.5 389.1 75.7 395.3L123.7 443.3C126.7 446.3 130.8 448 135 448L288.4 448L288.4 544C288.4 561.7 302.7 576 320.4 576C338.1 576 352.4 561.7 352.4 544L352.4 448L512.4 448C530.1 448 544.4 433.7 544.4 416L544.4 352C544.4 334.3 530.1 320 512.4 320L352.4 320L352.4 256L505.8 256C510 256 514.1 254.3 517.1 251.3L565.1 203.3C571.3 197.1 571.3 186.9 565.1 180.7L517.1 132.7C514.1 129.7 510 128 505.8 128L352.4 128L352.4 96C352.4 78.3 338.1 64 320.4 64z"/>
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

<Tutorial steps={tutorialSteps} storageKey="tutorial-lens" />

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

	/* Force pointer-events none on ALL descendants including MapLibre canvas,
	   which sets pointer-events: auto internally. Without this, the lens map's
	   canvas intercepts events and blocks the background map. */
	.map-container.lens :global(*) {
		pointer-events: none !important;
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

	/* Year labels anchored to lens edges */
	.lens-year-label {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(6px);
		color: white;
		padding: 5px 14px;
		border-radius: 16px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		user-select: none;
		display: flex;
		align-items: center;
		gap: 5px;
		transition: background 0.2s, top 0.15s ease;
		white-space: nowrap;
	}

	.lens-year-label:hover {
		background: rgba(0, 0, 0, 0.85);
	}

	.lens-year-label.inside {
		/* inside the lens, near top — top is set via inline style */
	}

	.lens-year-label.outside {
		/* outside the lens, below bottom — top is set via inline style */
	}

	.year-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(10px);
		border-radius: 12px;
		padding: 6px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
		gap: 3px;
		min-width: 200px;
		max-width: 320px;
		max-height: 250px;
		overflow-y: auto;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}

	.year-dropdown.up {
		top: auto;
		bottom: calc(100% + 6px);
	}

	.year-option {
		background: transparent;
		border: none;
		color: white;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		text-align: center;
		white-space: nowrap;
	}

	.year-option:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.year-option.selected {
		background: #3b82f6;
	}

	/* Mobile adjustments */
	@media (max-width: 768px) {
		.controls-left {
			bottom: 180px;
		}

		:global(.maplibregl-ctrl-bottom-left) {
			margin-bottom: 60px !important;
		}

		.lens-year-label {
			font-size: 12px;
			padding: 5px 10px;
		}

		.year-dropdown {
			min-width: 160px;
			max-width: 260px;
		}
	}
</style>
