<script lang="ts">
	import { onMount } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import MaplibreGeocoder from '@maplibre/maplibre-gl-geocoder';
	import '@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css';
	import type { RegionConfig, OrthoGroup } from './regionConfig';
	import { groupOrthophotos, positronSource, positronLayer, labelsSource, labelsLayer } from './regionConfig';
	import { createGeocoderApi } from './geocoder';
	import YearPicker from './YearPicker.svelte';

	export let region: RegionConfig;

	let beforeContainer: HTMLDivElement;
	let afterContainer: HTMLDivElement;
	let mapWrapper: HTMLDivElement;
	let geocoderContainer: HTMLDivElement;
	let navigationContainer: HTMLDivElement;
	let attributionContainer: HTMLDivElement;
	let beforeMap: maplibregl.Map;
	let afterMap: maplibregl.Map;
	let showStreetNames = false;
	let sliderValue = 50;
	let isDragging = false;
	let activePointerId: number | null = null;
	let sliderRAF: number | null = null;

	function updateSliderValue(value: number) {
		sliderValue = value;
		if (sliderRAF) cancelAnimationFrame(sliderRAF);
		sliderRAF = requestAnimationFrame(() => {
			if (afterMap) afterMap.triggerRepaint();
		});
	}

	function toggleStreetNames() {
		showStreetNames = !showStreetNames;
		const maps = [beforeMap, afterMap].filter(Boolean);
		for (const m of maps) {
			if (showStreetNames) {
				if (!m.getSource('labels')) m.addSource('labels', labelsSource);
				if (!m.getLayer('labels-layer')) m.addLayer(labelsLayer);
			} else {
				if (m.getLayer('labels-layer')) m.removeLayer('labels-layer');
				if (m.getSource('labels')) m.removeSource('labels');
			}
		}
	}

	// --- Helpers for active layer tracking ---
	const activeLayerIdsByMap = new WeakMap<maplibregl.Map, Set<string>>();

	function getActiveSet(m: maplibregl.Map) {
		let s = activeLayerIdsByMap.get(m);
		if (!s) {
			s = new Set<string>();
			activeLayerIdsByMap.set(m, s);
		}
		return s;
	}

	// Track active tile waits so we can cancel them during map movement
	let activeTileWaits = new Set<() => void>();

	// Wait for tiles in current viewport to be loaded
	// cancelOnMove: only true for the interactive (before) map; the after map
	// receives synthetic moves from sync, so cancelling on move would cause gaps.
	function waitForTiles(map: maplibregl.Map, layerIds: string[], timeout = 3000, cancelOnMove = true): Promise<void> {
		return new Promise((resolve) => {
			let done = false;
			const finish = () => {
				if (!done) {
					done = true;
					cleanup();
					activeTileWaits.delete(cancel);
					resolve();
				}
			};

			// Allow external cancellation (e.g., when user starts moving)
			const cancel = () => {
				if (!done) {
					finish();
				}
			};
			activeTileWaits.add(cancel);

			const onIdle = () => {
				const sourcesReady = layerIds.every((lid) => {
					const srcId = lid.replace(/-layer$/, '');
					const source = map.getSource(srcId);
					return !!source && map.isSourceLoaded(srcId);
				});
				if (sourcesReady && map.areTilesLoaded()) finish();
			};

			const onMoveStart = () => {
				finish();
			};

			const to = setTimeout(finish, timeout);
			const cleanup = () => {
				map.off('idle', onIdle);
				if (cancelOnMove) map.off('movestart', onMoveStart);
				clearTimeout(to);
			};

			map.on('idle', onIdle);
			if (cancelOnMove) map.on('movestart', onMoveStart);
			// Try immediately if already ready
			onIdle();
		});
	}

	// Create (if needed) source/layer raster, with opacity 0 and visible
	function ensureRaster(map: maplibregl.Map, ortho: any, tileSize = 512) {
		const srcId = ortho.id;
		const layerId = `${ortho.id}-layer`;

		if (!isMapAlive(map)) return layerId;

		if (!map.getSource(srcId)) {
			map.addSource(srcId, {
				type: 'raster',
				tiles: [region.getTileUrl(ortho, tileSize)],
				tileSize,
				maxzoom: region.maxSourceZoom
			});
		}

		if (!map.getLayer(layerId)) {
			map.addLayer({
				id: layerId,
				type: 'raster',
				source: srcId,
				layout: { visibility: 'visible' },
				paint: {
					'raster-opacity': 0, // Start hidden
					'raster-fade-duration': 300, // Nice fade
					'raster-resampling': 'nearest'
				}
			});
		}

		return layerId;
	}

	// Group orthophotos by year using shared helper
	const groupedOrthos: OrthoGroup[] = groupOrthophotos(region.orthophotos);

	// Selected year groups
	let selectedBeforeGroupId = groupedOrthos[0].id;
	let selectedAfterGroupId = groupedOrthos[groupedOrthos.length - 1].id;

	// Pointer Events for slider - unified mouse/touch/pen handling
	function onHandlePointerDown(e: PointerEvent) {
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		activePointerId = e.pointerId;
		isDragging = true;
	}

	function onHandlePointerMove(e: PointerEvent) {
		if (!isDragging || activePointerId !== e.pointerId || !mapWrapper) return;
		// Don't preventDefault - allows multi-touch gestures on map
		const rect = mapWrapper.getBoundingClientRect();
		const x = e.clientX - rect.left;
		updateSliderValue(Math.max(0, Math.min(100, (x / rect.width) * 100)));
	}

	function onHandlePointerUp(e: PointerEvent) {
		if (activePointerId === e.pointerId) {
			const handle = e.currentTarget as HTMLElement;
			try {
				handle.releasePointerCapture(e.pointerId);
			} catch {}
			isDragging = false;
			activePointerId = null;
		}
	}

	// Keyboard handler for slider accessibility
	function onHandleKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			updateSliderValue(Math.max(0, sliderValue - 1));
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			updateSliderValue(Math.min(100, sliderValue + 1));
		}
	}

	// Track pending layer changes to prevent race conditions
	const pendingLayerChanges = new WeakMap<maplibregl.Map, Promise<void>>();

	// Check if map is still usable (not removed by HMR or cleanup)
	function isMapAlive(m: maplibregl.Map): boolean {
		try { return !!m.getStyle(); } catch { return false; }
	}

	// Preload and cross-fade to new year without showing blank canvas
	async function addYearGroupToMap(targetMap: maplibregl.Map, group: any) {
		if (!isMapAlive(targetMap)) return;

		// Wait for any pending layer change to complete first
		const existing = pendingLayerChanges.get(targetMap);
		if (existing) {
			await existing;
		}

		if (!isMapAlive(targetMap)) return;

		// Create a promise for this layer change
		const changePromise = (async () => {
			if (!isMapAlive(targetMap)) return;

			const activeSet = getActiveSet(targetMap);
			const previousIds = [...activeSet];

			// 1) Add/ensure all sublayers (opacity 0)
			const newLayerIds = group.layers.map((ortho: any) => ensureRaster(targetMap, ortho, 512));

			// 2) Order layers (bottom to top) - do this without blocking
			requestAnimationFrame(() => {
				if (!isMapAlive(targetMap)) return;
				newLayerIds.forEach((lid: string) => {
					if (targetMap.getLayer(lid)) targetMap.moveLayer(lid);
				});
			});

			// 3) Wait for tiles - only cancel on move for the interactive (before) map
			const isInteractive = targetMap === beforeMap;
			await waitForTiles(targetMap, newLayerIds, isInteractive ? 1500 : 4000, isInteractive);

			if (!isMapAlive(targetMap)) return;

			// 4) Cross-fade: new to 1, old to 0 (no gap)
			requestAnimationFrame(() => {
				if (!isMapAlive(targetMap)) return;
				newLayerIds.forEach((lid: string) => {
					if (targetMap.getLayer(lid)) {
						targetMap.setPaintProperty(lid, 'raster-opacity', 1);
					}
				});
				previousIds.forEach((lid: string) => {
					if (targetMap.getLayer(lid)) {
						targetMap.setPaintProperty(lid, 'raster-opacity', 0);
					}
				});
			});

			// 5) Deferred cleanup (after fade)
			setTimeout(() => {
				if (!isMapAlive(targetMap)) return;
				previousIds.forEach((lid: string) => {
					if (!newLayerIds.includes(lid)) {
						const srcId = lid.replace(/-layer$/, '');
						if (targetMap.getLayer(lid)) targetMap.removeLayer(lid);
						if (targetMap.getSource(srcId)) targetMap.removeSource(srcId);
						activeSet.delete(lid);
					}
				});
				newLayerIds.forEach((lid: string) => activeSet.add(lid));
				// Keep labels layer on top if active
				if (showStreetNames && targetMap.getLayer('labels-layer')) {
					targetMap.moveLayer('labels-layer');
				}
			}, 400);
		})();

		pendingLayerChanges.set(targetMap, changePromise);
		await changePromise;
		pendingLayerChanges.delete(targetMap);
	}

	// Reference to updateHash function (will be set in onMount)
	let updateHashFn: ((pushToHistory: boolean) => void) | null = null;

	function updateBeforeLayer(newGroupId: string) {
		if (!beforeMap) return;
		const newGroup = groupedOrthos.find((g) => g.id === newGroupId);
		if (!newGroup) return;

		addYearGroupToMap(beforeMap, newGroup);
		selectedBeforeGroupId = newGroupId;

		// Update hash immediately and add to history
		if (updateHashFn) {
			updateHashFn(true);
		}
	}

	function updateAfterLayer(newGroupId: string) {
		if (!afterMap) return;
		const newGroup = groupedOrthos.find((g) => g.id === newGroupId);
		if (!newGroup) return;

		addYearGroupToMap(afterMap, newGroup);
		selectedAfterGroupId = newGroupId;

		// Update hash immediately and add to history
		if (updateHashFn) {
			updateHashFn(true);
		}
	}

	onMount(() => {
		let isSyncing = false;

		// Create geocoder API from region config
		const { cache: geocoderCache, api: geocoderApi } = createGeocoderApi(region.geocoder);

		// Parse hash for shared position and years (#lat,lng,zoom,beforeYear,afterYear)
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
					return true;
				}
			}
			return false;
		};

		// Try parsing hash with retries for production reliability
		parseHash();

		// Get orthophoto group configs
		const beforeGroup = groupedOrthos.find((g) => g.id === selectedBeforeGroupId)!;
		const afterGroup = groupedOrthos.find((g) => g.id === selectedAfterGroupId)!;

		// Base style with Positron layer
		const baseStyle = {
			version: 8 as const,
			sources: {
				'positron': positronSource
			},
			layers: [
				positronLayer
			]
		};

		// Before map (left side)
		const beforeMapOptions: any = {
			container: beforeContainer,
			style: baseStyle as any,
			minZoom: region.minZoom,
			maxZoom: region.maxZoom,
			maxBounds: region.maxBounds,
			attributionControl: false,
			renderWorldCopies: false, // Avoid requests outside bounds
			fadeDuration: 0 // We handle fading per layer
		};
		if (initialPosition) {
			beforeMapOptions.center = (initialPosition as { center: [number, number]; zoom: number }).center;
			beforeMapOptions.zoom = (initialPosition as { center: [number, number]; zoom: number }).zoom;
		} else {
			beforeMapOptions.bounds = region.bounds;
			beforeMapOptions.fitBoundsOptions = { padding: region.fitBoundsPadding };
		}
		beforeMap = new maplibregl.Map(beforeMapOptions);

		// After map (right side) - non interactive, synced from beforeMap
		const afterMapOptions: any = {
			container: afterContainer,
			style: JSON.parse(JSON.stringify(baseStyle)), // Deep copy to avoid shared reference
			minZoom: region.minZoom,
			maxZoom: region.maxZoom,
			maxBounds: region.maxBounds,
			interactive: false,
			attributionControl: false,
			renderWorldCopies: false,
			fadeDuration: 0
		};
		if (initialPosition) {
			afterMapOptions.center = (initialPosition as { center: [number, number]; zoom: number }).center;
			afterMapOptions.zoom = (initialPosition as { center: [number, number]; zoom: number }).zoom;
		} else {
			afterMapOptions.bounds = region.bounds;
			afterMapOptions.fitBoundsOptions = { padding: region.fitBoundsPadding };
		}
		afterMap = new maplibregl.Map(afterMapOptions);

		// Error handling with retry for failed tiles
		const retryCount = new Map<string, number>();
		const handleMapError = (map: maplibregl.Map) => (e: any) => {
			console.warn('Map error:', e?.error?.status, e?.sourceId);
			if (e.sourceId && e.error?.status >= 500) {
				const count = retryCount.get(e.sourceId) || 0;
				if (count < 2) {
					retryCount.set(e.sourceId, count + 1);
					setTimeout(() => {
						const source = map.getSource(e.sourceId);
						if (source && 'reload' in source) {
							(source as any).reload();
						}
					}, 1000 * (count + 1));
				}
			}
		};

		beforeMap.on('error', handleMapError(beforeMap));
		afterMap.on('error', handleMapError(afterMap));

		// Quand chaque carte est prête, on injecte le groupe sélectionné
		beforeMap.once('load', () => addYearGroupToMap(beforeMap, beforeGroup));
		afterMap.once('load', () => addYearGroupToMap(afterMap, afterGroup));

		// Extract navigation and attribution controls from map DOM to avoid z-index issues
		const navigationControl = new maplibregl.NavigationControl();
		const navigationElement = navigationControl.onAdd(beforeMap);
		if (navigationContainer) {
			navigationContainer.appendChild(navigationElement);
		}

		const attributionControl = new maplibregl.AttributionControl({
			customAttribution: region.attribution
		});
		const attributionElement = attributionControl.onAdd(beforeMap);
		if (attributionContainer) {
			attributionContainer.appendChild(attributionElement);
		}

		// Add geocoder for address search
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

		// Add geocoder to custom overlay container instead of map
		// This prevents it from being covered by the after map's z-index
		const geocoderElement = geocoder.onAdd(beforeMap);
		if (geocoderContainer) {
			geocoderContainer.appendChild(geocoderElement);
		}

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

					// Add touch/click handlers for mobile
					suggestions.forEach((suggestion, index) => {
						const handleSelect = (ev: Event) => {
							ev.preventDefault();
							ev.stopPropagation();

							if (currentResults[index]) {
								// Blur input to dismiss keyboard on mobile
								const input = document.querySelector('.maplibregl-ctrl-geocoder input') as HTMLInputElement;
								if (input) input.blur();

								// Zoom to result
								zoomToResult(currentResults[index]);

								// Clear geocoder
								setTimeout(() => {
									if (input) input.value = '';
									geocoder.clear();
									currentResults = [];
								}, 100);
							}
						};

						// Remove any existing listeners
						suggestion.removeEventListener('touchend', handleSelect as any);
						suggestion.removeEventListener('click', handleSelect as any);

						// Add new listeners
						suggestion.addEventListener('touchend', handleSelect as any, { passive: false });
						suggestion.addEventListener('click', handleSelect as any);
					});
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

			try {
				target.jumpTo({
					center: source.getCenter(),
					zoom: source.getZoom(),
					bearing: source.getBearing(),
					pitch: source.getPitch()
				});
			} finally {
				// Use microtask so isSyncing stays true during synchronous move events
				// but resets before next user interaction
				Promise.resolve().then(() => { isSyncing = false; });
			}
		};

		// Debounced hash update for browser history
		let hashUpdateTimeout: number | null = null;
		let lastHashUpdate = '';

		const updateHash = (pushToHistory: boolean = false) => {
			if (typeof window === 'undefined' || !beforeMap) return;

			const center = beforeMap.getCenter();
			const zoom = beforeMap.getZoom();
			const newHash = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoom.toFixed(2)}z,${selectedBeforeGroupId},${selectedAfterGroupId}`;

			if (newHash === lastHashUpdate) return;
			lastHashUpdate = newHash;

			if (pushToHistory) {
				window.location.hash = newHash;
			} else {
				// Replace current history entry without adding new one
				// Using replaceState is fine for hash-only changes
				history.replaceState(null, '', `#${newHash}`);
			}
		};

		// Make updateHash available to year update functions
		updateHashFn = updateHash;

		// Throttle hash updates to max ~8/s during movement
		let lastHashTs = 0;

		beforeMap.on('move', () => {
			if (!isDragging && !isSyncing) {
				syncMaps(beforeMap, afterMap);
			}

			// Throttled URL update to avoid saturating main thread
			const now = performance.now();
			if (now - lastHashTs > 120) {
				updateHash(false);
				lastHashTs = now;
			}

			// Debounce: only add to history after user stops moving
			if (hashUpdateTimeout) clearTimeout(hashUpdateTimeout);
			hashUpdateTimeout = window.setTimeout(() => {
				updateHash(true);
			}, 800);
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
					if (beforeMap) {
						beforeMap.flyTo({ center: [lng, lat], zoom, duration: 1000 });
					}

					// Update year selections if provided
					if (parts.length >= 5) {
						const beforeYear = parts[3];
						const afterYear = parts[4];

						if (beforeYear && beforeYear !== selectedBeforeGroupId) {
							const beforeGroup = groupedOrthos.find(g => g.id === beforeYear);
							if (beforeGroup) {
								selectedBeforeGroupId = beforeYear;
								addYearGroupToMap(beforeMap, beforeGroup);
							}
						}

						if (afterYear && afterYear !== selectedAfterGroupId) {
							const afterGroup = groupedOrthos.find(g => g.id === afterYear);
							if (afterGroup) {
								selectedAfterGroupId = afterYear;
								addYearGroupToMap(afterMap, afterGroup);
							}
						}
					}
				}
			}
		};

		window.addEventListener('hashchange', handleHashChange);

		// Safety: periodic check to ensure isSyncing doesn't get stuck
		const syncCheckInterval = setInterval(() => {
			if (isSyncing) {
				console.warn('isSyncing stuck - forcing reset');
				isSyncing = false;
			}
		}, 5000);

		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('hashchange', handleHashChange);
			clearInterval(syncCheckInterval);
			beforeMap.remove();
			afterMap.remove();
		};
	});
</script>

<!-- Removed global window listeners - using pointer capture instead -->

<div class="timelapse-container">
	<!-- Map comparison -->
	<div class="map-wrapper" bind:this={mapWrapper}>
		<div bind:this={beforeContainer} class="map-container before"></div>
		<div
			bind:this={afterContainer}
			class="map-container after"
			style="clip-path: inset(0 0 0 calc({sliderValue}% - 0.5px))"
		></div>

		<!-- Control overlays - outside map containers to avoid z-index issues -->
		<div bind:this={geocoderContainer} class="geocoder-overlay"></div>
		<div class="controls-stack">
			<button class="street-names-btn" class:active={showStreetNames} on:click={toggleStreetNames} title="Noms de rues" aria-label="Afficher/masquer les noms de rues">
				<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 3v18"/>
					<path d="M6 7h8l2-2-2-2H6z" fill="currentColor" opacity="0.15"/>
					<path d="M6 7h8l2-2-2-2H6"/>
					<path d="M18 14H10l-2 2 2 2h8z" fill="currentColor" opacity="0.15"/>
					<path d="M18 14H10l-2 2 2 2h8"/>
				</svg>
			</button>
			<div bind:this={navigationContainer} class="navigation-inner"></div>
		</div>
		<div bind:this={attributionContainer} class="attribution-overlay"></div>

		<div class="compare-slider" style="left: {sliderValue}%">
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="slider-handle"
				role="button"
				tabindex="0"
				aria-label="Curseur de comparaison avant/après"
				on:pointerdown={onHandlePointerDown}
				on:pointermove={onHandlePointerMove}
				on:pointerup={onHandlePointerUp}
				on:pointercancel={onHandlePointerUp}
				on:keydown={onHandleKeydown}
			>
				<span class="slider-arrows">◄ ►</span>
			</div>
		</div>
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
		position: absolute !important;
		top: 0 !important;
		left: 0 !important;
		width: 100% !important;
		height: 100% !important;
		min-height: 500px !important;
	}

	.map-container.before {
		z-index: 0 !important;
		pointer-events: auto !important;
	}

	:global(.map-container.before .maplibregl-canvas-container),
	:global(.map-container.before .maplibregl-canvas) {
		width: 100% !important;
		height: 100% !important;
		pointer-events: auto !important;
		touch-action: none !important;
	}

	.map-container.after {
		z-index: 1 !important;
		pointer-events: none !important;
	}

	:global(.map-container.after *) {
		pointer-events: none !important;
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

	.slider-handle:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	.slider-arrows {
		font-size: 14px;
		color: #333;
		pointer-events: none;
	}

	/* Control overlays - positioned above both maps */
	.geocoder-overlay {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 100;
		pointer-events: none; /* Allow clicks to pass through the container */
	}

	:global(.geocoder-overlay .maplibregl-ctrl-geocoder) {
		width: 600px;
		max-width: calc(100vw - 20px);
		pointer-events: auto !important; /* But enable clicks on the geocoder itself */
	}

	:global(.geocoder-overlay .maplibregl-ctrl-geocoder *) {
		pointer-events: auto !important;
	}

	/* Geocoder suggestions dropdown must be above everything */
	:global(.geocoder-overlay .maplibregl-ctrl-geocoder .suggestions) {
		z-index: 250 !important;
		position: absolute !important;
	}

	.controls-stack {
		position: absolute;
		bottom: 50px;
		left: 10px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}

	.street-names-btn {
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

	.navigation-inner {
		pointer-events: none;
	}

	:global(.navigation-inner .maplibregl-ctrl) {
		pointer-events: auto !important;
	}

	.attribution-overlay {
		position: absolute;
		bottom: 0;
		right: 0;
		z-index: 100;
		pointer-events: none;
	}

	:global(.attribution-overlay .maplibregl-ctrl) {
		pointer-events: auto !important;
	}

	:global(.maplibregl-ctrl-top-right) {
		z-index: 100 !important;
	}

	@media (max-width: 768px) {
		:global(.geocoder-overlay .maplibregl-ctrl-geocoder) {
			width: calc(100vw - 20px);
		}
	}

	/* Vertical navigation controls */
	:global(.navigation-inner .maplibregl-ctrl-group button) {
		width: 29px !important;
		height: 29px !important;
	}

	@media (max-width: 768px) {
		.controls-stack {
			bottom: 60px;
		}
	}
</style>
