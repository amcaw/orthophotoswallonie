<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import orthophotosBrusselsConfig from './orthophotosBrussels.json';
	import ShareButtons from './ShareButtons.svelte';

	let beforeContainer: HTMLDivElement;
	let afterContainer: HTMLDivElement;
	let beforeMap: maplibregl.Map;
	let afterMap: maplibregl.Map;
	let isSwapped = false;

	// Track map position for sharing
	let currentCenter: { lng: number; lat: number } = { lng: 4.35, lat: 50.85 };
	let currentZoom: number = 11;

	const brusselsBounds: [[number, number], [number, number]] = [
		[4.243, 50.764],
		[4.482, 50.913]
	];

	// MaxBounds élargi pour permettre un meilleur affichage au zoom out
	const brusselsMaxBounds: [[number, number], [number, number]] = [
		[4.05, 50.65],
		[4.68, 51.05]
	];

	// Helper to generate WMS tile URL based on ortho config
	function getTileUrl(ortho: any): string {
		const config = orthophotosBrusselsConfig;

		// Check if this is an EPSG:31370 layer (urban-brussels service)
		// Request reprojection to EPSG:3857 for display in web maps
		if (ortho.service === 'urban-brussels' && ortho.crs === 'EPSG:31370') {
			return `${config.wmsUrbanBrusselsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${ortho.layer}&CRS=EPSG:3857&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
		}

		// Regular EPSG:3857 layer
		return `${config.wmsBaseUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${ortho.layer}&CRS=EPSG:3857&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;
	}

	function toggleSwap() {
		isSwapped = !isSwapped;
	}

	onMount(() => {
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

		let isSyncing = false;
		const geocoderCache = new Map<string, any>();

		// Get orthophoto configs - before: 1971, after: 2024
		const beforeOrtho = orthophotosBrusselsConfig.orthophotos.find(o => o.id === 'ortho-1971')!;
		const afterOrtho = orthophotosBrusselsConfig.orthophotos.find(o => o.id === 'ortho-2024')!;

		// Setup initial position options
		const mapPositionOptions: any = initialPosition
			? { center: (initialPosition as any).center, zoom: (initialPosition as any).zoom }
			: { bounds: brusselsBounds, fitBoundsOptions: { padding: 20 } };

		// After map (2024) - visible partout
		afterMap = new maplibregl.Map({
			container: afterContainer,
			style: {
				version: 8,
				sources: {
					[afterOrtho.id]: {
						type: 'raster',
						tiles: [getTileUrl(afterOrtho)],
						tileSize: 256
					}
				},
				layers: [
					{
						id: `${afterOrtho.id}-layer`,
						type: 'raster',
						source: afterOrtho.id,
						paint: {}
					}
				]
			},
			...mapPositionOptions,
			minZoom: 10,
			maxZoom: 20,
			maxBounds: brusselsMaxBounds,
			attributionControl: false
		});

		// Before map (2004) - visible dans le cercle
		beforeMap = new maplibregl.Map({
			container: beforeContainer,
			style: {
				version: 8,
				sources: {
					[beforeOrtho.id]: {
						type: 'raster',
						tiles: [getTileUrl(beforeOrtho)],
						tileSize: 256
					}
				},
				layers: [
					{
						id: `${beforeOrtho.id}-layer`,
						type: 'raster',
						source: beforeOrtho.id,
						paint: {}
					}
				]
			},
			...mapPositionOptions,
			minZoom: 10,
			maxZoom: 20,
			maxBounds: brusselsMaxBounds,
			attributionControl: false
		});

		// Wait for maps to load tiles before showing
		let afterMapLoaded = false;
		let beforeMapLoaded = false;

		afterMap.once('idle', () => {
			afterMapLoaded = true;
		});

		beforeMap.once('idle', () => {
			beforeMapLoaded = true;
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
			customAttribution: 'Made by <a href="https://bsky.app/profile/amcaw.bsky.social" target="_blank">@amcaw</a> - Creative Commons Attribution (CC-BY) - <a href="https://be.brussels/en/about-region/structure-and-organisations/administrations-and-institutions-region/paradigm" target="_blank">Paradigm</a> - <a href="https://bruciel.brussels/" target="_blank">Bruciel</a>'
		}), 'bottom-right');

		// Add geocoder for address search to both maps
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
						// Filter: keep only results in Brussels-Capital Region
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

		// Add geocoder to both maps so it's always visible
		afterMap.addControl(geocoder, 'top-left');

		const geocoder2 = new MaplibreGeocoder(geocoderApi, {
			maplibregl: maplibregl,
			placeholder: 'Cherchez une adresse à Bruxelles',
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
			}
			// Update position for share buttons
			const center = afterMap.getCenter();
			currentCenter = { lng: center.lng, lat: center.lat };
			currentZoom = afterMap.getZoom();

			// Update URL hash with current position
			if (typeof window !== 'undefined') {
				window.location.hash = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${currentZoom.toFixed(2)}z`;
			}
		});

		beforeMap.on('move', () => {
			if (!isSyncing) {
				syncMaps(beforeMap, afterMap);
			}
			// Update URL hash with current position
			if (typeof window !== 'undefined') {
				const center = beforeMap.getCenter();
				const zoom = beforeMap.getZoom();
				window.location.hash = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoom.toFixed(2)}z`;
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

<div class="map-lens-wrapper">
	<div bind:this={afterContainer} class="map-container after" class:lens={isSwapped}></div>
	<div bind:this={beforeContainer} class="map-container before" class:lens={!isSwapped}></div>
	<div class="lens-border"></div>

	<button class="swap-button" on:click={toggleSwap} title="Inverser les couches">
		<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="17 1 21 5 17 9"></polyline>
			<path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
			<polyline points="7 23 3 19 7 15"></polyline>
			<path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
		</svg>
	</button>

	<ShareButtons
		lat={currentCenter.lat}
		lng={currentCenter.lng}
		zoom={currentZoom}
		yearBefore="ortho-1971"
		yearAfter="ortho-2024"
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
		clip-path: circle(200px at center);
		z-index: 2;
	}

	.map-container:not(.lens) {
		z-index: 1;
	}

	.lens-border {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 400px;
		height: 400px;
		border: 3px solid white;
		border-radius: 50%;
		pointer-events: none;
		z-index: 3;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
	}

	.swap-button {
		position: absolute;
		bottom: 150px;
		left: 10px;
		z-index: 1000;
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

	.swap-button:hover {
		background: #f2f2f2;
	}

	.swap-button svg {
		width: 15px;
		height: 15px;
	}

	/* Position controls higher to avoid attribution overlap */
	:global(.maplibregl-ctrl-bottom-left) {
		margin-bottom: 50px !important;
	}

	/* Mobile: smaller lens */
	@media (max-width: 768px) {
		.map-container.lens {
			clip-path: circle(120px at center);
		}

		.lens-border {
			width: 240px;
			height: 240px;
		}

		.swap-button {
			bottom: 180px;
		}

		:global(.maplibregl-ctrl-bottom-left) {
			margin-bottom: 60px !important;
		}
	}
</style>
