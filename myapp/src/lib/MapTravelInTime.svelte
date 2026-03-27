<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import type { RegionConfig, OrthoGroup } from './regionConfig';
	import { groupOrthophotos, labelsSource, labelsLayer } from './regionConfig';
	import { createGeocoderApi } from './geocoder';
	import ShareButtons from './ShareButtons.svelte';

	export let region: RegionConfig;

	let mapContainer: HTMLDivElement;
	let map: maplibregl.Map;
	let showStreetNames = false;
	let isPlaying = false;
	let currentIndex = 0;
	let animationInterval: number | null = null;
	let progressPercent = 0;

	// Track map position for sharing
	let currentCenter: { lng: number; lat: number } = { lng: region.defaultCenter.lng, lat: region.defaultCenter.lat };
	let currentZoom: number = region.defaultZoom;

	function toggleStreetNames() {
		showStreetNames = !showStreetNames;
		if (!map) return;
		if (showStreetNames) {
			if (!map.getSource('labels')) map.addSource('labels', labelsSource);
			if (!map.getLayer('labels-layer')) map.addLayer(labelsLayer);
		} else {
			if (map.getLayer('labels-layer')) map.removeLayer('labels-layer');
			if (map.getSource('labels')) map.removeSource('labels');
		}
	}

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

	// Fit "solide" sur les bounds de la région
	function fitToRegion(opts?: {animate?: boolean}) {
		if (!map || !mapContainer) return;
		const padding = getResponsivePadding(mapContainer);
		map.resize(); // IMPORTANT: recalculer la taille du canvas avant le fit

		// Calculate dynamic minZoom based on viewport width to ensure map always fits
		const w = mapContainer.clientWidth || window.innerWidth;
		const dynamicMinZoom = region.getDynamicMinZoom(w);

		// Update map minZoom dynamically
		map.setMinZoom(dynamicMinZoom);

		// Adjust padding using region-specific adjustment
		const adj = region.fitBoundsPaddingAdjust;
		const adjustedPadding = {
			top: padding.top + adj,
			right: padding.right + adj,
			bottom: padding.bottom + adj,
			left: padding.left + adj
		};

		map.fitBounds(region.bounds, {
			padding: adjustedPadding,
			duration: opts?.animate ? 400 : 0
		});
	}

	// Group orthophotos by year, including multi-season years
	const allOrthos: OrthoGroup[] = groupOrthophotos(region.orthophotos);

	function preloadAdjacentLayers() {
		if (!map) return;

		// Preload next layer
		const nextIndex = (currentIndex + 1) % allOrthos.length;
		const nextGroup = allOrthos[nextIndex];

		// Add sources and layers for all seasons in the next group
		nextGroup.layers.forEach((ortho: any) => {
			if (!map.getSource(ortho.id)) {
				map.addSource(ortho.id, {
					type: 'raster',
					tiles: [region.getTileUrl(ortho)],
					tileSize: 256,
					maxzoom: region.maxSourceZoom
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

		// Preload previous layer
		const prevIndex = (currentIndex - 1 + allOrthos.length) % allOrthos.length;
		const prevGroup = allOrthos[prevIndex];

		// Add sources and layers for all seasons in the previous group
		prevGroup.layers.forEach((ortho: any) => {
			if (!map.getSource(ortho.id)) {
				map.addSource(ortho.id, {
					type: 'raster',
					tiles: [region.getTileUrl(ortho)],
					tileSize: 256,
					maxzoom: region.maxSourceZoom
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

		// Preload adjacent layers
		preloadAdjacentLayers();

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
				preloadAdjacentLayers();
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

	// Reference to updateHash function (will be set in onMount)
	let updateHashFn: ((pushToHistory: boolean) => void) | null = null;

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

		// Update hash immediately and add to history
		if (updateHashFn) {
			updateHashFn(true);
		}
	}


	// True cross-fade: new layer fades in ON TOP of old layer, then old is removed.
	// This avoids any white flash from the basemap showing through.
	let updateLayerGeneration = 0;

	function updateLayer(fadeMs = 0) {
		if (!map) return;

		const gen = ++updateLayerGeneration;
		const currentGroup = allOrthos[currentIndex];
		const newLayerIds = currentGroup.layers.map((o: any) => `${o.id}-layer`);

		// Collect old layer ids that will be replaced
		const oldLayerIds: string[] = [];
		const style = map.getStyle();
		if (style?.layers) {
			for (const l of style.layers) {
				if (!l.id.endsWith('-layer') || l.id === 'labels-layer') continue;
				if (!newLayerIds.includes(l.id)) oldLayerIds.push(l.id);
			}
		}

		// 1) Ensure new sources & layers exist (opacity 0, on top of old ones)
		currentGroup.layers.forEach((ortho: any) => {
			const srcId = ortho.id;
			const layerId = `${ortho.id}-layer`;

			if (!map.getSource(srcId)) {
				map.addSource(srcId, {
					type: 'raster',
					tiles: [region.getTileUrl(ortho)],
					tileSize: 256,
					maxzoom: region.maxSourceZoom
				});
			}

			if (!map.getLayer(layerId)) {
				map.addLayer({
					id: layerId,
					type: 'raster',
					source: srcId,
					paint: {
						'raster-opacity': 0,
						'raster-opacity-transition': { duration: 0, delay: 0 },
						'raster-fade-duration': 0
					}
				});
			}
		});

		// 2) Move new layers to top (above old layers), then labels on very top
		newLayerIds.forEach((lid: string) => {
			if (map.getLayer(lid)) map.moveLayer(lid);
		});
		if (showStreetNames && map.getLayer('labels-layer')) {
			map.moveLayer('labels-layer');
		}

		// 3) Cross-fade: fade new layers IN while old layers stay visible underneath
		const doFade = () => {
			if (gen !== updateLayerGeneration || !map) return;

			if (fadeMs > 0) {
				// Fade new layers to 1 over fadeMs
				newLayerIds.forEach((lid: string) => {
					if (map.getLayer(lid)) {
						map.setPaintProperty(lid, 'raster-opacity-transition', { duration: fadeMs, delay: 0 });
						map.setPaintProperty(lid, 'raster-opacity', 1);
					}
				});

				// Old layers: stay fully visible during fade, then get removed
				// This is the key difference — no white gap
				setTimeout(() => {
					if (gen !== updateLayerGeneration || !map) return;
					oldLayerIds.forEach((lid) => {
						if (map.getLayer(lid)) map.removeLayer(lid);
						const srcId = lid.replace(/-layer$/, '');
						if (map.getSource(srcId)) map.removeSource(srcId);
					});
				}, fadeMs + 50);
			} else {
				// Instant switch (no fade)
				newLayerIds.forEach((lid: string) => {
					if (map.getLayer(lid)) {
						map.setPaintProperty(lid, 'raster-opacity-transition', { duration: 0, delay: 0 });
						map.setPaintProperty(lid, 'raster-opacity', 1);
					}
				});
				oldLayerIds.forEach((lid) => {
					if (map.getLayer(lid)) map.removeLayer(lid);
					const srcId = lid.replace(/-layer$/, '');
					if (map.getSource(srcId)) map.removeSource(srcId);
				});
			}
		};

		// 4) Try to wait for new tiles before fading, but don't block too long
		let shown = false;
		const onSourceData = (e: any) => {
			if (shown || gen !== updateLayerGeneration) { map.off('sourcedata', onSourceData); return; }
			const allLoaded = currentGroup.layers.every((o: any) => {
				const src = map.getSource(o.id);
				return src && map.isSourceLoaded(o.id);
			});
			if (allLoaded) {
				shown = true;
				map.off('sourcedata', onSourceData);
				doFade();
			}
		};

		map.on('sourcedata', onSourceData);

		// Fallback timeout — don't wait forever
		setTimeout(() => {
			if (!shown && gen === updateLayerGeneration) {
				shown = true;
				map.off('sourcedata', onSourceData);
				doFade();
			}
		}, fadeMs > 0 ? Math.max(fadeMs, 1500) : 500);
	}

	onMount(async () => {
		const firstGroup = allOrthos[0];

		// Create geocoder API from region config
		const { api: geocoderApi } = createGeocoderApi(region.geocoder);

		// Parse hash for shared position and year (#lat,lng,zoom,yearId)
		let initialPosition: { center: [number, number]; zoom: number } | null = null;

		// Function to parse hash
		const parseHash = () => {
			if (typeof window === 'undefined') return false;

			const hash = window.location.hash.slice(1);
			if (!hash) return false;

			const parts = hash.split(',');
			if (parts.length >= 3) {
				const lat = parseFloat(parts[0]);
				const lng = parseFloat(parts[1]);
				const zoom = parseFloat(parts[2].replace('z', ''));
				if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
					initialPosition = { center: [lng, lat], zoom };
					// Restore year selection if provided
					if (parts.length >= 4) {
						const yearId = parts[3];
						const yearIndex = allOrthos.findIndex(g => g.id === yearId);
						if (yearIndex !== -1) {
							currentIndex = yearIndex;
							progressPercent = (yearIndex / (allOrthos.length - 1)) * 100;
						}
					}
					return true;
				}
			}
			return false;
		};

		// Try parsing hash with retries for production reliability
		if (!parseHash()) {
			await new Promise(resolve => setTimeout(resolve, 10));
			parseHash();
		}

		const initialSources: any = {};
		const initialLayers: any[] = [];

		firstGroup.layers.forEach((ortho: any) => {
			initialSources[ortho.id] = {
				type: 'raster',
				tiles: [region.getTileUrl(ortho)],
				tileSize: 256,
				maxzoom: region.maxSourceZoom
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
			...(initialPosition ? { center: initialPosition.center, zoom: initialPosition.zoom } : {}),
			maxZoom: region.maxZoom,
			minZoom: region.minZoom, // Will be dynamically adjusted by fitToRegion
			maxBounds: region.maxBounds,
			preserveDrawingBuffer: true,
			attributionControl: false
		} as any);

		map.addControl(new maplibregl.AttributionControl({
			customAttribution: region.attribution
		}), 'bottom-right');

		// Add geocoder for address search
		const geocoder = new MaplibreGeocoder(geocoderApi, {
			maplibregl: maplibregl,
			placeholder: region.geocoder.placeholder,
			flyTo: true,
			showResultsWhileTyping: true,
			marker: false,
			debounceSearch: 400,
			minLength: 2,
			showResultMarkers: false
		});

		map.addControl(geocoder, 'top-left');
		map.addControl(new maplibregl.NavigationControl(), 'top-left');

		// Debounced hash update for browser history
		let hashUpdateTimeout: number | null = null;
		let lastHashUpdate = '';

		const updateHash = (pushToHistory: boolean = false) => {
			if (typeof window === 'undefined' || !map) return;

			const center = map.getCenter();
			const zoom = map.getZoom();
			const yearId = allOrthos[currentIndex]?.id;
			const newHash = yearId
				? `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoom.toFixed(2)}z,${yearId}`
				: `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoom.toFixed(2)}z`;

			if (newHash === lastHashUpdate) return;
			lastHashUpdate = newHash;

			if (pushToHistory) {
				window.location.hash = newHash;
			} else {
				// Replace current history entry without adding new one
				history.replaceState(null, '', `#${newHash}`);
			}
		};

		// Make updateHash available to jumpToYear function
		updateHashFn = updateHash;

		// Track map position for share buttons and update hash
		map.on('move', () => {
			const center = map.getCenter();
			currentCenter = { lng: center.lng, lat: center.lat };
			currentZoom = map.getZoom();

			// Update URL immediately without adding to history
			updateHash(false);

			// Debounce: only add to history after user stops moving for 1 second
			if (hashUpdateTimeout) clearTimeout(hashUpdateTimeout);
			hashUpdateTimeout = window.setTimeout(() => {
				updateHash(true);
			}, 1000);
		});

		// Fit lorsque la carte est totalement "idle" (style + sources + layers prêts) - skip if we have hash position
		map.once('idle', () => {
			if (!initialPosition) {
				fitToRegion({ animate: false });
			}
		});

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
				fitToRegion({ animate: false });
			}
		});
		ro.observe(mapContainer);

		// Initial resize after a short delay to ensure container is properly sized
		let resizeTimeout: number | null = null;
		const throttledResize = () => {
			if (resizeTimeout) return; // Already scheduled

			resizeTimeout = window.setTimeout(() => {
				if (map) map.resize();
				resizeTimeout = null;
			}, 250);
		};

		setTimeout(() => map.resize(), 100);

		window.addEventListener('resize', throttledResize);
		window.addEventListener('orientationchange', throttledResize);

		// Listen for hash changes (browser back/forward)
		const handleHashChange = () => {
			if (typeof window === 'undefined') return;

			const hash = window.location.hash.slice(1);
			if (!hash) return;

			const parts = hash.split(',');
			if (parts.length >= 3) {
				const lat = parseFloat(parts[0]);
				const lng = parseFloat(parts[1]);
				const zoom = parseFloat(parts[2].replace('z', ''));

				if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
					// Update map position
					if (map) {
						map.flyTo({ center: [lng, lat], zoom, duration: 1000 });
					}

					// Update year selection if provided
					if (parts.length >= 4) {
						const yearId = parts[3];
						const yearIndex = allOrthos.findIndex(g => g.id === yearId);
						if (yearIndex !== -1 && yearIndex !== currentIndex) {
							jumpToYear(yearIndex);
						}
					}
				}
			}
		};

		window.addEventListener('hashchange', handleHashChange);

		return () => {
			pause();
			ro.disconnect();
			window.removeEventListener('resize', throttledResize);
			window.removeEventListener('orientationchange', throttledResize);
			window.removeEventListener('hashchange', handleHashChange);
			map.remove();
		};
	});
</script>

<div class="travel-container">
	<div class="map-container" bind:this={mapContainer}></div>

	<div class="year-overlay">{allOrthos[currentIndex].displayYear}</div>

	<button class="street-names-btn" class:active={showStreetNames} on:click={toggleStreetNames} title="Noms de rues" aria-label="Afficher/masquer les noms de rues">
		<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 3v18"/>
			<path d="M6 7h8l2-2-2-2H6z" fill="currentColor" opacity="0.15"/>
			<path d="M6 7h8l2-2-2-2H6"/>
			<path d="M18 14H10l-2 2 2 2h8z" fill="currentColor" opacity="0.15"/>
			<path d="M18 14H10l-2 2 2 2h8"/>
		</svg>
	</button>

	<div class="share-wrapper-traveltime">
		<ShareButtons
			lat={currentCenter.lat}
			lng={currentCenter.lng}
			zoom={currentZoom}
		/>
	</div>

	<div class="playbar">
		<div class="playbar-controls">
			<button class="playbar-btn" on:click={togglePlayPause} aria-label="Lecture/Pause">
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
						aria-label="Aller à l'année {group.displayYear}"
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

	.street-names-btn {
		position: absolute;
		bottom: 120px;
		right: 20px;
		z-index: 10;
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

	.street-names-btn:hover {
		background: #f2f2f2;
	}

	.street-names-btn.active {
		background: #3b82f6;
		color: white;
	}

	.street-names-btn:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
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

	.share-wrapper-traveltime {
		position: absolute;
		bottom: 123px;
		right: 22px;
		z-index: 10;
	}

	.share-wrapper-traveltime :global(.share-buttons) {
		position: static;
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

	.playbar-btn:focus-visible,
	.year-marker:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
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
			bottom: 110px;
			left: 10px;
			font-size: 32px;
		}

		.playbar {
			padding: 12px 16px;
			left: 10px;
			right: 10px;
			bottom: 50px;
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
