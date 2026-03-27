import type { GeocoderConfig } from './regionConfig';

// Compute center from a GeoJSON feature
function computeCenter(feature: any, fallbackCenter: [number, number]): [number, number] {
	const rawBbox = feature.bbox as [number, number, number, number] | undefined;
	const bbox =
		Array.isArray(rawBbox) && rawBbox.length === 4
			? (rawBbox.map(Number) as [number, number, number, number])
			: undefined;

	if (bbox) {
		return [bbox[0] + (bbox[2] - bbox[0]) / 2, bbox[1] + (bbox[3] - bbox[1]) / 2];
	}

	if (feature.geometry?.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
		return [Number(feature.geometry.coordinates[0]), Number(feature.geometry.coordinates[1])];
	}

	// Fallback: compute bbox from complex geometry
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
	collect(feature.geometry);

	if (coords.length) {
		const lons = coords.map((c) => c[0]);
		const lats = coords.map((c) => c[1]);
		const b: [number, number, number, number] = [
			Math.min(...lons), Math.min(...lats),
			Math.max(...lons), Math.max(...lats)
		];
		return [b[0] + (b[2] - b[0]) / 2, b[1] + (b[3] - b[1]) / 2];
	}

	return fallbackCenter;
}

// Create a geocoder API compatible with MaplibreGeocoder
export function createGeocoderApi(config: GeocoderConfig) {
	const cache = new Map<string, any>();

	return {
		cache,
		api: {
			forwardGeocode: async (geocoderConfig: any) => {
				const query = (geocoderConfig.query ?? '').trim().toLowerCase();

				if (cache.has(query)) {
					return cache.get(query);
				}

				const features: any[] = [];
				try {
					const q = encodeURIComponent(query);
					if (!q) return { type: 'FeatureCollection' as const, features };

					const url =
						`https://nominatim.openstreetmap.org/search?` +
						`q=${q}, ${config.searchSuffix}&format=geojson&polygon_geojson=1&addressdetails=1&countrycodes=be&limit=20`;

					const response = await fetch(url, {
						headers: { 'Accept-Language': 'fr' }
					});
					const geojson = await response.json();

					for (const f of geojson.features ?? []) {
						if (!config.isInRegion(f)) continue;

						const rawBbox = f.bbox as [number, number, number, number] | undefined;
						const bbox =
							Array.isArray(rawBbox) && rawBbox.length === 4
								? (rawBbox.map(Number) as [number, number, number, number])
								: undefined;

						const center = computeCenter(f, config.fallbackCenter);

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

				if (cache.size >= 50) {
					const firstKey = cache.keys().next().value;
					if (firstKey !== undefined) cache.delete(firstKey);
				}
				cache.set(query, result);

				return result;
			}
		}
	};
}
