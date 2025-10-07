<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import orthophotosConfig from './orthophotos.json';

	let beforeContainer: HTMLDivElement;
	let afterContainer: HTMLDivElement;
	let beforeMap: maplibregl.Map;
	let afterMap: maplibregl.Map;
	let isSwapped = false;

	const walloniaBounds: [[number, number], [number, number]] = [
		[2.75, 49.45],
		[6.5, 50.85]
	];

	function toggleSwap() {
		isSwapped = !isSwapped;
	}

	onMount(() => {
		let isSyncing = false;

		// Get orthophoto configs
		const beforeOrtho = orthophotosConfig.orthophotos.find(o => o.id === 'ortho-1971')!;
		const afterOrtho = orthophotosConfig.orthophotos.find(o => o.id === 'ortho-2023-ete')!;

		// After map (2023) - visible partout
		afterMap = new maplibregl.Map({
			container: afterContainer,
			style: {
				version: 8,
				sources: {
					[afterOrtho.id]: {
						type: 'raster',
						tiles: [
							`${afterOrtho.url}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&f=image`
						],
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
			bounds: walloniaBounds,
			fitBoundsOptions: { padding: 20 },
			minZoom: 8,
			maxZoom: 17,
			attributionControl: false
		});

		// Before map (1971) - visible dans le cercle
		beforeMap = new maplibregl.Map({
			container: beforeContainer,
			style: {
				version: 8,
				sources: {
					[beforeOrtho.id]: {
						type: 'raster',
						tiles: [
							`${beforeOrtho.url}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&f=image`
						],
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
			bounds: walloniaBounds,
			fitBoundsOptions: { padding: 20 },
			minZoom: 8,
			maxZoom: 17,
			attributionControl: false
		});

		// Add controls to both maps so they're always visible
		afterMap.addControl(new maplibregl.NavigationControl(), 'bottom-left');
		beforeMap.addControl(new maplibregl.NavigationControl(), 'bottom-left');

		// Add custom attribution
		afterMap.addControl(new maplibregl.AttributionControl({
			customAttribution: 'Made by <a href="https://bsky.app/profile/amcaw.bsky.social" target="_blank">@amcaw</a> - Service public de Wallonie (Licence CC-BY 4.0)'
		}), 'bottom-right');

		// Add geocoder for address search to both maps
		const geocoderApi = {
			forwardGeocode: async (config: any) => {
				const features: any[] = [];
				try {
					const q = encodeURIComponent((config.query ?? '').trim());
					if (!q) return { type: 'FeatureCollection' as const, features };

					const url =
						`https://nominatim.openstreetmap.org/search?` +
						`q=${q}, Wallonie&format=geojson&polygon_geojson=1&addressdetails=1&countrycodes=be&limit=20`;

					const response = await fetch(url, {
						headers: {
							'Accept-Language': 'fr'
						}
					});
					const geojson = await response.json();

					// Provinces wallonnes pour filtrage
					const walloniaProvinces = ['Hainaut', 'Liège', 'Luxembourg', 'Namur', 'Brabant wallon'];

					for (const f of geojson.features ?? []) {
						// Filtre: garde seulement les résultats en Wallonie
						const state = f.properties?.address?.state;
						const county = f.properties?.address?.county;

						const isInWallonia =
							state === 'Wallonie' ||
							state === 'Région wallonne' ||
							walloniaProvinces.some(
								(province) => county?.includes(province) || state?.includes(province)
							);

						if (!isInWallonia) continue;
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
								// dernier recours : Belgique
								center = [4.4699, 50.5039];
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

				return { type: 'FeatureCollection' as const, features };
			}
		};

		const geocoder = new MaplibreGeocoder(geocoderApi, {
			maplibregl: maplibregl,
			placeholder: 'Cherchez une adresse en Wallonie',
			flyTo: false,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 200,
			minLength: 2,
			showResultMarkers: false
		});

		// Add geocoder to both maps so it's always visible
		afterMap.addControl(geocoder, 'top-left');

		const geocoder2 = new MaplibreGeocoder(geocoderApi, {
			maplibregl: maplibregl,
			placeholder: 'Cherchez une adresse en Wallonie',
			flyTo: false,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 200,
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
		});

		beforeMap.on('move', () => {
			if (!isSyncing) {
				syncMaps(beforeMap, afterMap);
			}
		});

		return () => {
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
		bottom: 120px;
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
</style>
