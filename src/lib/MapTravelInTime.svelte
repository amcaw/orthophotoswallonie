<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import orthophotosConfig from './orthophotos.json';

	let mapContainer: HTMLDivElement;
	let map: maplibregl.Map;
	let isPlaying = false;
	let currentIndex = 0;
	let animationInterval: number | null = null;
	let progressPercent = 0;

	const walloniaBounds: [[number, number], [number, number]] = [
		[2.75, 49.45],
		[6.5, 50.85]
	];

	// Padding responsive pour tenir compte de la playbar en bas et de l'overlay année en haut
	function getResponsivePadding(container: HTMLElement) {
		const w = container.clientWidth || window.innerWidth;
		const h = container.clientHeight || window.innerHeight;

		// marges en px proportionnelles + minimas
		const base = Math.round(Math.max(12, Math.min(w, h) * 0.03));

		// sur mobile on réserve plus d'espace pour la playbar (bas)
		const isSmall = w < 768;
		const bottomExtra = isSmall ? 120 : 80; // playbar
		const topExtra = isSmall ? 30 : 40;     // overlay année

		return {
			top: base + topExtra,
			right: base + 10,
			bottom: base + bottomExtra,
			left: base + 10
		};
	}

	// Fit "solide" sur les bounds de la Wallonie
	function fitToWallonia(opts?: {animate?: boolean}) {
		if (!map || !mapContainer) return;
		const padding = getResponsivePadding(mapContainer);
		map.resize(); // IMPORTANT: recalculer la taille du canvas avant le fit

		// Calculate dynamic minZoom based on viewport width to ensure map always fits
		const w = mapContainer.clientWidth || window.innerWidth;
		const dynamicMinZoom = w < 640 ? 6.5 : w < 1024 ? 7 : w < 1300 ? 7.5 : 8;

		// Update map minZoom dynamically
		map.setMinZoom(dynamicMinZoom);

		map.fitBounds(walloniaBounds, {
			padding,
			duration: opts?.animate ? 400 : 0
		});
	}

	// Group orthophotos by year, including 2022 with multiple seasons
	const allOrthos = orthophotosConfig.orthophotos
		.reduce((groups: any[], ortho: any) => {
			const baseYear = ortho.year.split(' ')[0]; // "2022" from "2022 Printemps"
			const existingGroup = groups.find((g) => g.year === baseYear);

			if (existingGroup) {
				existingGroup.layers.push(ortho);
			} else {
				groups.push({
					year: baseYear,
					displayYear: baseYear,
					layers: [ortho]
				});
			}
			return groups;
		}, [])
		// Sort layers within each group (Printemps before Été)
		.map((g) => ({
			...g,
			layers: g.layers.slice().sort((a: any, b: any) => {
				const order = (s: string) =>
					/Printemps/i.test(s) ? 0 :
					/Été|Ete/i.test(s) ? 1 : 2;
				return order(a.year) - order(b.year);
			})
		}));

	function preloadNextLayer() {
		if (!map) return;

		const nextIndex = (currentIndex + 1) % allOrthos.length;
		const nextGroup = allOrthos[nextIndex];

		// Add sources and layers for all seasons in the group
		nextGroup.layers.forEach((ortho: any) => {
			if (!map.getSource(ortho.id)) {
				map.addSource(ortho.id, {
					type: 'raster',
					tiles: [
						`${ortho.url}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`
					],
					tileSize: 256,
					maxzoom: 18
				});
			}

			if (!map.getLayer(`${ortho.id}-layer`)) {
				map.addLayer({
					id: `${ortho.id}-layer`,
					type: 'raster',
					source: ortho.id,
					paint: {
						'raster-opacity': 0,
						'raster-fade-duration': 0
					}
				});
			}
		});
	}

	function togglePlayPause() {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}

	function play() {
		if (!map) return;
		isPlaying = true;

		// Preload next layer
		preloadNextLayer();

		// Animate progress bar smoothly starting from current progress
		const startTime = Date.now();
		const startProgress = progressPercent / 100 * (allOrthos.length - 1); // Convert percent to float index
		const interval = 2500; // Change layer every 2.5 seconds
		const fadeMs = 1300; // Crossfade duration

		const animate = () => {
			if (!isPlaying) return;

			const elapsed = Date.now() - startTime;
			const progressInLayers = elapsed / interval;
			const currentProgress = startProgress + progressInLayers;

			// Stop at the end
			if (currentProgress >= allOrthos.length - 1) {
				currentIndex = allOrthos.length - 1;
				progressPercent = 100;
				pause();
				return;
			}

			const targetIndex = Math.floor(currentProgress);

			// Update progress bar smoothly
			progressPercent = (currentProgress / (allOrthos.length - 1)) * 100;

			// Change layer when reaching next index
			if (targetIndex !== currentIndex) {
				currentIndex = targetIndex;
				updateLayer(fadeMs);
				preloadNextLayer();
			}

			animationInterval = window.requestAnimationFrame(animate);
		};

		animationInterval = window.requestAnimationFrame(animate);
	}

	function pause() {
		isPlaying = false;
		if (animationInterval) {
			cancelAnimationFrame(animationInterval);
			animationInterval = null;
		}

		// Update currentIndex to match the floored progress position for next play
		const indexFromProgress = Math.floor((progressPercent / 100) * (allOrthos.length - 1));
		if (indexFromProgress >= 0 && indexFromProgress < allOrthos.length) {
			currentIndex = indexFromProgress;
		}

		// Don't call updateLayer() - keep the visual state as-is
	}

	function jumpToYear(index: number) {
		// Pause if currently playing
		const wasPlaying = isPlaying;
		if (wasPlaying) {
			pause();
		}

		// Smooth interpolation of progress bar
		const targetPercent = (index / (allOrthos.length - 1)) * 100;
		const startPercent = progressPercent;
		const startTime = Date.now();
		const duration = 300; // 300ms animation

		const animateProgress = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Ease out cubic
			const ease = 1 - Math.pow(1 - progress, 3);
			progressPercent = startPercent + (targetPercent - startPercent) * ease;

			if (progress < 1) {
				requestAnimationFrame(animateProgress);
			} else {
				progressPercent = targetPercent;
			}
		};

		currentIndex = index;
		updateLayer();
		animateProgress();
	}


	function updateLayer(fadeMs = 0) {
		if (!map) return;

		const currentGroup = allOrthos[currentIndex];

		// Fade out all existing layers that aren't in current group
		const style = map.getStyle();
		if (style?.layers) {
			for (const l of style.layers) {
				if (!l.id.endsWith('-layer')) continue;
				const belongsToCurrent = currentGroup.layers.some((o: any) => `${o.id}-layer` === l.id);
				if (!belongsToCurrent && map.getLayer(l.id)) {
					map.setPaintProperty(l.id, 'raster-opacity-transition', { duration: fadeMs, delay: 0 });
					map.setPaintProperty(l.id, 'raster-opacity', 0);
				}
			}
		}

		// Add sources and layers for current group
		currentGroup.layers.forEach((ortho: any) => {
			const srcId = ortho.id;
			const layerId = `${ortho.id}-layer`;

			if (!map.getSource(srcId)) {
				map.addSource(srcId, {
					type: 'raster',
					tiles: [
						`${ortho.url}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`
					],
					tileSize: 256,
					maxzoom: 18
				});
			}

			if (!map.getLayer(layerId)) {
				map.addLayer({
					id: layerId,
					type: 'raster',
					source: srcId,
					paint: {
						'raster-opacity': 0,
						'raster-fade-duration': 0
					}
				});
			}
		});

		// Order layers (bottom to top)
		currentGroup.layers.forEach((ortho: any) => {
			const layerId = `${ortho.id}-layer`;
			if (map.getLayer(layerId)) map.moveLayer(layerId);
		});

		// Fade in all current group layers
		currentGroup.layers.forEach((ortho: any) => {
			const layerId = `${ortho.id}-layer`;

			if (map.getLayer(layerId)) {
				map.setPaintProperty(layerId, 'raster-opacity-transition', { duration: fadeMs, delay: 0 });
				map.setPaintProperty(layerId, 'raster-opacity', 1);
			}
		});

		// Clean up old layers after fade completes
		if (fadeMs > 0) {
			setTimeout(() => {
				const style = map?.getStyle();
				if (!style?.layers) return;

				for (const l of style.layers) {
					if (!l.id.endsWith('-layer')) continue;
					const belongsToCurrent = currentGroup.layers.some((o: any) => `${o.id}-layer` === l.id);
					if (!belongsToCurrent) {
						if (map.getLayer(l.id)) map.removeLayer(l.id);
						const srcId = (l as any).source;
						if (srcId && map.getSource(srcId)) map.removeSource(srcId);
					}
				}
			}, fadeMs + 100);
		}
	}

	onMount(() => {
		const firstGroup = allOrthos[0];

		const initialSources: any = {};
		const initialLayers: any[] = [];

		firstGroup.layers.forEach((ortho: any) => {
			initialSources[ortho.id] = {
				type: 'raster',
				tiles: [
					`${ortho.url}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`
				],
				tileSize: 256,
				maxzoom: 18
			};
		});

		firstGroup.layers.forEach((ortho: any) => {
			initialLayers.push({
				id: `${ortho.id}-layer`,
				type: 'raster',
				source: ortho.id,
				paint: {
					'raster-opacity': 1,
					'raster-fade-duration': 0
				}
			});
		});

		map = new maplibregl.Map({
			container: mapContainer,
			style: {
				version: 8,
				sources: initialSources,
				layers: initialLayers
			},
			// Ne pas passer bounds ici (certains navigateurs mobile font un fit trop tôt)
			maxZoom: 16,
			minZoom: 6, // Will be dynamically adjusted by fitToWallonia
			preserveDrawingBuffer: true,
			attributionControl: false
		} as any);

		map.addControl(new maplibregl.AttributionControl({
			customAttribution: 'Made by <a href="https://bsky.app/profile/amcaw.bsky.social" target="_blank">@amcaw</a> - Service public de Wallonie (Licence CC-BY 4.0)'
		}), 'bottom-right');

		// Add geocoder for address search
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

					const walloniaProvinces = [
						'Hainaut',
						'Liège',
						'Luxembourg',
						'Namur',
						'Brabant wallon'
					];

					for (const f of geojson.features ?? []) {
						const state = f.properties?.address?.state;
						const county = f.properties?.address?.county;

						const isInWallonia =
							state === 'Wallonie' ||
							state === 'Région wallonne' ||
							walloniaProvinces.some(
								(province) => county?.includes(province) || state?.includes(province)
							);

						if (!isInWallonia) continue;

						const rawBbox = f.bbox as [number, number, number, number] | undefined;
						const bbox =
							Array.isArray(rawBbox) && rawBbox.length === 4
								? (rawBbox.map(Number) as [number, number, number, number])
								: undefined;

						let center: [number, number];
						if (bbox) {
							center = [bbox[0] + (bbox[2] - bbox[0]) / 2, bbox[1] + (bbox[3] - bbox[1]) / 2];
						} else if (f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
							center = [Number(f.geometry.coordinates[0]), Number(f.geometry.coordinates[1])];
						} else {
							center = [4.4699, 50.5039];
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
			flyTo: true,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 200,
			minLength: 2,
			showResultMarkers: false
		});

		map.addControl(geocoder, 'top-left');
		map.addControl(new maplibregl.NavigationControl(), 'top-left');

		// Fit lorsque la carte est totalement "idle" (style + sources + layers prêts)
		map.once('idle', () => fitToWallonia({ animate: false }));

		// Track container size to only refit on actual resize, not other events
		let lastWidth = mapContainer.clientWidth;
		let lastHeight = mapContainer.clientHeight;

		// ResizeObserver pour toute variation de taille du conteneur (layout, split view, etc.)
		const ro = new ResizeObserver(() => {
			const newWidth = mapContainer.clientWidth;
			const newHeight = mapContainer.clientHeight;

			// Only refit if container size actually changed
			if (newWidth !== lastWidth || newHeight !== lastHeight) {
				lastWidth = newWidth;
				lastHeight = newHeight;
				fitToWallonia({ animate: false });
			}
		});
		ro.observe(mapContainer);

		// Orientation & resize fenêtre (iOS/Android barre d'adresse, etc.)
		const onWinResize = () => {
			const newWidth = mapContainer.clientWidth;
			const newHeight = mapContainer.clientHeight;

			if (newWidth !== lastWidth || newHeight !== lastHeight) {
				lastWidth = newWidth;
				lastHeight = newHeight;
				fitToWallonia({ animate: false });
			}
		};

		// Initial resize after a short delay to ensure container is properly sized
		setTimeout(() => map.resize(), 100);

		window.addEventListener('resize', onWinResize);
		window.addEventListener('orientationchange', onWinResize);

		return () => {
			pause();
			ro.disconnect();
			window.removeEventListener('resize', onWinResize);
			window.removeEventListener('orientationchange', onWinResize);
			map.remove();
		};
	});
</script>

<div class="travel-container">
	<div class="map-container" bind:this={mapContainer}></div>

	<div class="year-overlay">{allOrthos[currentIndex].displayYear}</div>

	<div class="playbar">
		<div class="playbar-controls">
			<button class="playbar-btn" on:click={togglePlayPause}>
				{#if isPlaying}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<rect x="6" y="4" width="4" height="16" />
						<rect x="14" y="4" width="4" height="16" />
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<polygon points="5,3 19,12 5,21" />
					</svg>
				{/if}
			</button>
		</div>

		<div class="timeline">
			<div class="timeline-track">
				<div class="timeline-progress" style="width: {progressPercent}%"></div>
			</div>
			<div class="timeline-years">
				{#each allOrthos as group, idx}
					{@const position = (idx / (allOrthos.length - 1)) * 100}
					<button
						class="year-marker"
						class:active={idx === currentIndex}
						on:click={() => jumpToYear(idx)}
						style="left: {position}%"
					>
						<span class="year-label">{group.displayYear}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
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

	.travel-container {
		position: relative;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
	}

	.map-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.year-overlay {
		position: absolute;
		bottom: 110px;
		left: 20px;
		z-index: 10;
		color: white;
		font-size: 48px;
		font-weight: bold;
		font-family: 'Zalando Sans', sans-serif;
		opacity: 0.8;
		text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8);
		pointer-events: none;
	}

	.playbar {
		position: absolute;
		bottom: 50px;
		left: 20px;
		right: 20px;
		z-index: 10;
		background: rgba(0, 0, 0, 0.85);
		padding: 16px 20px;
		border-radius: 12px;
		backdrop-filter: blur(10px);
		display: flex;
		align-items: center;
		gap: 16px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.playbar-controls {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.playbar-btn {
		background: white;
		border: none;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
		color: #0ea5e9;
		transition: all 0.2s;
	}

	.playbar-btn:hover {
		background: #f0f9ff;
		transform: scale(1.1);
	}


	.timeline {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		position: relative;
	}

	.timeline-track {
		width: 100%;
		height: 6px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		position: relative;
		overflow: visible;
	}

	.timeline-progress {
		height: 100%;
		background: #0ea5e9;
		border-radius: 3px;
	}

	.timeline-years {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 12px;
		z-index: 10;
		transform: translateY(-50%);
	}

	.year-marker {
		position: absolute;
		transform: translateX(-50%);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.year-marker::before {
		content: '';
		width: 2px;
		height: 16px;
		background: rgba(255, 255, 255, 0.5);
		display: block;
		transition: all 0.2s;
	}

	.year-marker:hover::before,
	.year-marker.active::before {
		background: white;
	}

	.year-label {
		color: rgba(255, 255, 255, 0.6);
		font-size: 9px;
		font-family: 'Zalando Sans', sans-serif;
		white-space: nowrap;
		transition: all 0.2s;
		margin-top: 2px;
	}

	.year-marker:hover .year-label,
	.year-marker.active .year-label {
		color: white;
		font-weight: bold;
	}



	@media (max-width: 768px) {
		.year-overlay {
			bottom: 100px;
			left: 10px;
			font-size: 32px;
		}

		.playbar {
			padding: 12px 16px;
			left: 10px;
			right: 10px;
			bottom: 40px;
		}

		.playbar-btn {
			width: 32px;
			height: 32px;
		}

		.year-label {
			font-size: 7px;
		}
	}

	@media (max-width: 640px) {
		.year-label {
			display: none;
		}
	}
</style>
