<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import orthophotosBrusselsConfig from './orthophotosBrussels.json';
	import YearPicker from './YearPicker.svelte';
	import ShareButtons from './ShareButtons.svelte';

	let beforeContainer: HTMLDivElement;
	let afterContainer: HTMLDivElement;
	let mapWrapper: HTMLDivElement;
	let beforeMap: maplibregl.Map;
	let afterMap: maplibregl.Map;
	let sliderValue = 50;
	let isDragging = false;

	// Track map position for sharing
	let currentCenter: { lng: number; lat: number } = { lng: 4.35, lat: 50.85 };
	let currentZoom: number = 11;

	// Helper to generate WMS tile URL based on ortho config
	function getTileUrl(ortho: any): string {
		const config = orthophotosBrusselsConfig;

		// Check if this is an EPSG:31370 layer (urban-brussels service)
		if (ortho.service === 'urban-brussels' && ortho.crs === 'EPSG:31370') {
			return `${config.wmsUrbanBrusselsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${ortho.layer}&CRS=EPSG:3857&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
		}

		// Regular EPSG:3857 layer
		return `${config.wmsBaseUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${ortho.layer}&CRS=EPSG:3857&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
	}

	// No grouping needed - each entry is already a single year
	const groupedOrthos = orthophotosBrusselsConfig.orthophotos.map((ortho: any) => ({
		id: ortho.id,
		year: ortho.year,
		displayYear: ortho.year,
		layers: [ortho]
	}));

	// Selected year groups
	let selectedBeforeGroupId = groupedOrthos[0].id;
	let selectedAfterGroupId = groupedOrthos[groupedOrthos.length - 1].id;

	function handleMouseDown(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging || !mapWrapper) return;
		e.preventDefault();

		const rect = mapWrapper.getBoundingClientRect();
		const x = e.clientX - rect.left;
		sliderValue = Math.max(0, Math.min(100, (x / rect.width) * 100));
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function handleTouchStart(e: TouchEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging || !mapWrapper) return;
		e.preventDefault();

		const rect = mapWrapper.getBoundingClientRect();
		const x = e.touches[0].clientX - rect.left;
		sliderValue = Math.max(0, Math.min(100, (x / rect.width) * 100));
	}

	function handleTouchEnd() {
		isDragging = false;
	}

	function addYearGroupToMap(targetMap: maplibregl.Map, group: any) {
		// 1) Nettoyer toute couche existante (sécurité)
		const style = targetMap.getStyle();
		if (style?.layers) {
			for (const l of style.layers) {
				if (!l.id.endsWith('-layer')) continue;
				if (targetMap.getLayer(l.id)) targetMap.removeLayer(l.id);
				const srcId = (l as any).source;
				if (srcId && targetMap.getSource(srcId)) targetMap.removeSource(srcId);
			}
		}

		// 2) Ajouter toutes les sous-couches de l'année
		group.layers.forEach((ortho: any) => {
			const srcId = ortho.id;
			const layerId = `${ortho.id}-layer`;

			if (!targetMap.getSource(srcId)) {
				targetMap.addSource(srcId, {
					type: 'raster',
					tiles: [getTileUrl(ortho)],
					tileSize: 256,
					maxzoom: 20
				});
			}

			if (!targetMap.getLayer(layerId)) {
				targetMap.addLayer({
					id: layerId,
					type: 'raster',
					source: srcId,
					paint: {
						'raster-opacity': 0,          // on positionne plus bas
						'raster-fade-duration': 0,
						'raster-resampling': 'nearest'
					}
				});
			}
		});

		// 3) Ordonner les couches : index 0 = bas, dernier = au-dessus
		group.layers.forEach((ortho: any) => {
			const layerId = `${ortho.id}-layer`;
			if (targetMap.getLayer(layerId)) targetMap.moveLayer(layerId);
		});

		// 4) Opacités : toutes à 1
		group.layers.forEach((ortho: any) => {
			const layerId = `${ortho.id}-layer`;
			targetMap.setPaintProperty(layerId, 'raster-opacity', 1);
		});
	}

	function updateBeforeLayer(newGroupId: string) {
		if (!beforeMap) return;
		const newGroup = groupedOrthos.find((g) => g.id === newGroupId);
		if (!newGroup) return;

		addYearGroupToMap(beforeMap, newGroup);
		selectedBeforeGroupId = newGroupId;
	}

	function updateAfterLayer(newGroupId: string) {
		if (!afterMap) return;
		const newGroup = groupedOrthos.find((g) => g.id === newGroupId);
		if (!newGroup) return;

		addYearGroupToMap(afterMap, newGroup);
		selectedAfterGroupId = newGroupId;
	}

	onMount(() => {
		// Parse hash for shared position and years (#lat,lng,zoom,beforeYear,afterYear)
		let initialPosition: { center: [number, number]; zoom: number } | null = null;
		if (typeof window !== 'undefined' && window.location.hash) {
			const hash = window.location.hash.slice(1);
			const parts = hash.split(',');
			if (parts.length >= 3) {
				const lat = parseFloat(parts[0]);
				const lng = parseFloat(parts[1]);
				const zoom = parseFloat(parts[2].replace('z', ''));
				if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
					initialPosition = { center: [lng, lat], zoom };
				}
				// Restore year selections if provided
				if (parts.length >= 5) {
					const beforeYear = parts[3];
					const afterYear = parts[4];
					if (groupedOrthos.find(g => g.id === beforeYear)) {
						selectedBeforeGroupId = beforeYear;
					}
					if (groupedOrthos.find(g => g.id === afterYear)) {
						selectedAfterGroupId = afterYear;
					}
				}
			}
		}

		let isSyncing = false;
		const geocoderCache = new Map<string, any>();

		// Bounding box de Bruxelles
		const brusselsBounds: [[number, number], [number, number]] = [
			[4.243, 50.764],
			[4.482, 50.913]
		];

		// Get orthophoto group configs
		const beforeGroup = groupedOrthos.find((g) => g.id === selectedBeforeGroupId)!;
		const afterGroup = groupedOrthos.find((g) => g.id === selectedAfterGroupId)!;

		// Before map (left side)
		beforeMap = new maplibregl.Map({
			container: beforeContainer,
			style: { version: 8, sources: {}, layers: [] },
			...(initialPosition ? { center: initialPosition.center, zoom: initialPosition.zoom } : { bounds: brusselsBounds, fitBoundsOptions: { padding: 0 } }),
			minZoom: 10,
			maxZoom: 20,
			attributionControl: false
		});

		// After map (right side) - non interactive, synced from beforeMap
		afterMap = new maplibregl.Map({
			container: afterContainer,
			style: { version: 8, sources: {}, layers: [] },
			...(initialPosition ? { center: initialPosition.center, zoom: initialPosition.zoom } : { bounds: brusselsBounds, fitBoundsOptions: { padding: 0 } }),
			minZoom: 10,
			maxZoom: 20,
			interactive: false,
			attributionControl: false
		});

		// Quand chaque carte est prête, on injecte le groupe sélectionné
		beforeMap.once('load', () => addYearGroupToMap(beforeMap, beforeGroup));
		afterMap.once('load', () => addYearGroupToMap(afterMap, afterGroup));

		beforeMap.addControl(new maplibregl.NavigationControl(), 'bottom-left');
		beforeMap.addControl(new maplibregl.AttributionControl({
			customAttribution: 'Made by <a href="https://bsky.app/profile/amcaw.bsky.social" target="_blank">@amcaw</a> - Creative Commons Attribution (CC-BY) - <a href="https://be.brussels/en/about-region/structure-and-organisations/administrations-and-institutions-region/paradigm" target="_blank">Paradigm</a> - <a href="https://bruciel.brussels/" target="_blank">Bruciel</a>'
		}), 'bottom-right');

		// Add geocoder for address search
		const geocoderApi = {
			forwardGeocode: async (config: any) => {
				const query = (config.query ?? '').trim().toLowerCase();

				// Check cache first
				if (geocoderCache.has(query)) {
					return geocoderCache.get(query);
				}

				const features: any[] = [];
				try {
					const q = encodeURIComponent(query);
					if (!q) return { type: 'FeatureCollection' as const, features };

					const url =
						`https://nominatim.openstreetmap.org/search?` +
						`q=${q}, Bruxelles&format=geojson&polygon_geojson=1&addressdetails=1&countrycodes=be&limit=20`;

					const response = await fetch(url, {
						headers: {
							'Accept-Language': 'fr'
						}
					});
					const geojson = await response.json();

					for (const f of geojson.features ?? []) {
						// Filter: keep only results in Brussels
						const region = f.properties?.address?.region;
						const state = f.properties?.address?.state;

						const isInBrussels =
							region?.includes('Bruxelles') ||
							region?.includes('Brussels') ||
							state === 'Bruxelles-Capitale' ||
							state === 'Brussels Hoofdstedelijk Gewest' ||
							state === 'Région de Bruxelles-Capitale' ||
							state === 'Brussels-Capital';

						if (!isInBrussels) continue;

						// bbox peut être undefined ou des strings -> on normalise
						const rawBbox = f.bbox as [number, number, number, number] | undefined;
						const bbox =
							Array.isArray(rawBbox) && rawBbox.length === 4
								? (rawBbox.map(Number) as [number, number, number, number])
								: undefined;

						// centre: bbox si dispo, sinon géométrie
						let center: [number, number];
						if (bbox) {
							center = [bbox[0] + (bbox[2] - bbox[0]) / 2, bbox[1] + (bbox[3] - bbox[1]) / 2];
						} else if (f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
							center = [Number(f.geometry.coordinates[0]), Number(f.geometry.coordinates[1])];
						} else {
							// petit fallback: calcule un bbox approx de la géométrie si possible
							const coords: number[][] = [];
							const collect = (g: any) => {
								if (!g) return;
								if (g.type === 'Point') coords.push([+g.coordinates[0], +g.coordinates[1]]);
								else if (g.type === 'LineString' || g.type === 'MultiPoint')
									g.coordinates.forEach((c: any) => coords.push([+c[0], +c[1]]));
								else if (g.type === 'Polygon' || g.type === 'MultiLineString')
									g.coordinates.flat(1).forEach((c: any) => coords.push([+c[0], +c[1]]));
								else if (g.type === 'MultiPolygon')
									g.coordinates.flat(2).forEach((c: any) => coords.push([+c[0], +c[1]]));
								else if (g.type === 'GeometryCollection')
									(g.geometries || []).forEach(collect);
							};
							collect(f.geometry);

							if (coords.length) {
								const lons = coords.map((c) => c[0]);
								const lats = coords.map((c) => c[1]);
								const b: [number, number, number, number] = [
									Math.min(...lons),
									Math.min(...lats),
									Math.max(...lons),
									Math.max(...lats)
								];
								center = [b[0] + (b[2] - b[0]) / 2, b[1] + (b[3] - b[1]) / 2];
							} else {
								// dernier recours : Brussels center
								center = [4.3517, 50.8503];
							}
						}

						features.push({
							type: 'Feature' as const,
							geometry: { type: 'Point' as const, coordinates: center },
							place_name: f.properties?.display_name,
							properties: { ...f.properties, bbox },
							text: f.properties?.display_name,
							place_type: ['place'],
							center,
							bbox
						});
					}
				} catch (e) {
					console.error('forwardGeocode error:', e);
				}

				const result = { type: 'FeatureCollection' as const, features };

				// Cache the result (limit cache size to 50 entries)
				if (geocoderCache.size >= 50) {
					const firstKey = geocoderCache.keys().next().value;
					if (firstKey !== undefined) {
						geocoderCache.delete(firstKey);
					}
				}
				geocoderCache.set(query, result);

				return result;
			}
		};

		const geocoder = new MaplibreGeocoder(geocoderApi, {
			maplibregl: maplibregl,
			placeholder: 'Cherchez une adresse à Bruxelles',
			flyTo: false,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 400,
			minLength: 2,
			showResultMarkers: false
		});

		beforeMap.addControl(geocoder, 'top-left');

		// Fonction pour zoomer sur un résultat
		const zoomToResult = (result: any) => {
			const bbox = result.bbox ?? result.properties?.bbox;
			if (bbox && Array.isArray(bbox) && bbox.length === 4) {
				beforeMap.fitBounds(
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
				beforeMap.flyTo({ center: result.center, zoom: 15, duration: 1200 });
			}
		};

		// Amélioration UX: pré-sélectionne le premier résultat
		let currentResults: any[] = [];
		let selectedIndex = 0;

		// Capture les résultats de la recherche et pré-sélectionne le premier
		geocoder.on('results', (e: any) => {
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
		});

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
		geocoder.on('result', (e: any) => {
			const res = e.result;
			zoomToResult(res);

			// Efface le champ après sélection
			setTimeout(() => {
				const input = document.querySelector(
					'.maplibregl-ctrl-geocoder input'
				) as HTMLInputElement;
				if (input) input.value = '';
				geocoder.clear();
			}, 100);
		});

		// Sync maps without feedback loop
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

		beforeMap.on('move', () => {
			if (!isDragging && !isSyncing) {
				syncMaps(beforeMap, afterMap);
			}
			// Update position for share buttons and hash
			const center = beforeMap.getCenter();
			currentCenter = { lng: center.lng, lat: center.lat };
			currentZoom = beforeMap.getZoom();

			// Update URL hash with current position and selected years
			if (typeof window !== 'undefined') {
				window.location.hash = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${currentZoom.toFixed(2)}z,${selectedBeforeGroupId},${selectedAfterGroupId}`;
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

<svelte:window
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:touchmove={handleTouchMove}
	on:touchend={handleTouchEnd}
/>

<div class="timelapse-container">
	<!-- Map comparison -->
	<div class="map-wrapper" bind:this={mapWrapper}>
		<div bind:this={beforeContainer} class="map-container before"></div>
		<div
			bind:this={afterContainer}
			class="map-container after"
			style="clip-path: inset(0 0 0 {sliderValue}%)"
		></div>

		<div class="compare-slider" style="left: {sliderValue}%">
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="slider-handle"
				role="button"
				tabindex="0"
				on:mousedown={handleMouseDown}
				on:touchstart={handleTouchStart}
			>
				<span class="slider-arrows">◄ ►</span>
			</div>
		</div>

		<ShareButtons
			lat={currentCenter.lat}
			lng={currentCenter.lng}
			zoom={currentZoom}
			yearBefore={selectedBeforeGroupId}
			yearAfter={selectedAfterGroupId}
		/>
	</div>

	<!-- Year Pickers outside map-wrapper -->
	<YearPicker
		side="left"
		groups={groupedOrthos}
		selectedId={selectedBeforeGroupId}
		on:select={(e) => updateBeforeLayer(e.detail.id)}
	/>

	<YearPicker
		side="right"
		groups={groupedOrthos}
		selectedId={selectedAfterGroupId}
		on:select={(e) => updateAfterLayer(e.detail.id)}
	/>

</div>

<style>
	.timelapse-container {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.map-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		flex: 1;
		min-height: 500px;
		overflow: hidden;
	}

	.map-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		min-height: 500px;
	}

	:global(.map-container .maplibregl-canvas-container) {
		width: 100% !important;
		height: 100% !important;
	}

	:global(.map-container .maplibregl-canvas) {
		width: 100% !important;
		height: 100% !important;
	}

	.map-container.after {
		z-index: 1;
		pointer-events: none;
	}

	.compare-slider {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 4px;
		background: white;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
		z-index: 2;
		cursor: ew-resize;
		transform: translateX(-50%);
		pointer-events: none;
	}

	.slider-handle {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 60px;
		height: 60px;
		cursor: ew-resize;
		background: white;
		border-radius: 50%;
		pointer-events: all;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		user-select: none;
		touch-action: none;
	}

	.slider-arrows {
		font-size: 14px;
		color: #333;
		pointer-events: none;
	}

	/* Geocoder z-index */
	:global(.maplibregl-ctrl-top-left) {
		z-index: 100 !important;
	}

	:global(.maplibregl-ctrl-top-right) {
		z-index: 100 !important;
	}

	:global(.maplibregl-ctrl-geocoder) {
		z-index: 100 !important;
		position: relative;
		width: 600px;
		max-width: calc(100vw - 20px);
	}

	@media (max-width: 768px) {
		:global(.maplibregl-ctrl-geocoder) {
			width: calc(100vw - 20px);
		}
	}

	:global(.maplibregl-ctrl-geocoder .suggestions) {
		z-index: 101 !important;
		position: absolute;
	}

	/* Vertical navigation controls */
	:global(.maplibregl-ctrl-bottom-left .maplibregl-ctrl-group button) {
		width: 29px !important;
		height: 29px !important;
	}

	/* Align controls with geocoder */
	:global(.maplibregl-ctrl-top-left),
	:global(.maplibregl-ctrl-top-right) {
		margin-top: 10px !important;
	}

	/* Position bottom-left controls higher to avoid attribution overlap */
	:global(.maplibregl-ctrl-bottom-left) {
		margin-bottom: 50px !important;
	}

	@media (max-width: 768px) {
		:global(.maplibregl-ctrl-bottom-left) {
			margin-bottom: 60px !important;
		}
	}
</style>
