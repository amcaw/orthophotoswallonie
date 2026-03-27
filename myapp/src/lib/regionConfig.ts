import orthophotosWalloniaData from './orthophotos.json';
import orthophotosBrusselsData from './orthophotosBrussels.json';

export interface Orthophoto {
	id: string;
	year: string;
	label: string;
	url?: string;
	layer?: string;
	service?: string;
	crs?: string;
}

export interface OrthoGroup {
	id: string;
	year: string;
	displayYear: string;
	layers: Orthophoto[];
}

export interface GeocoderConfig {
	placeholder: string;
	searchSuffix: string;
	fallbackCenter: [number, number];
	isInRegion: (feature: any) => boolean;
}

export interface RegionConfig {
	name: 'wallonia' | 'brussels';
	displayName: string;
	bounds: [[number, number], [number, number]];
	maxBounds: [[number, number], [number, number]];
	defaultCenter: { lng: number; lat: number };
	defaultZoom: number;
	minZoom: number;
	maxZoom: number;
	fitBoundsPadding: number;
	orthophotos: Orthophoto[];
	defaultLensBeforeId: string;
	defaultLensAfterId: string;
	getTileUrl: (ortho: Orthophoto, tileSize?: number) => string;
	hasPositronBasemap: boolean;
	attribution: string;
	geocoder: GeocoderConfig;
	maxSourceZoom: number;
	getDynamicMinZoom: (viewportWidth: number) => number;
	fitBoundsPaddingAdjust: number;
}

// Group orthophotos by base year (handles seasons like "2022 Printemps", "2022 Été")
export function groupOrthophotos(orthophotos: Orthophoto[]): OrthoGroup[] {
	return orthophotos
		.reduce((groups: OrthoGroup[], ortho: Orthophoto) => {
			const baseYear = ortho.year.split(' ')[0];
			const existing = groups.find((g) => g.year === baseYear);
			if (existing) {
				existing.layers.push(ortho);
			} else {
				groups.push({
					id: baseYear,
					year: baseYear,
					displayYear: baseYear,
					layers: [ortho]
				});
			}
			return groups;
		}, [])
		.map((g) => ({
			...g,
			layers: g.layers.slice().sort((a, b) => {
				const order = (s: string) =>
					/Printemps/i.test(s) ? 0 :
					/Été|Ete/i.test(s) ? 1 : 2;
				return order(a.year) - order(b.year);
			})
		}));
}

const WALLONIA_PROVINCES = ['Hainaut', 'Liège', 'Luxembourg', 'Namur', 'Brabant wallon'];

export const walloniaConfig: RegionConfig = {
	name: 'wallonia',
	displayName: 'Wallonie',
	bounds: [[2.75, 49.45], [6.5, 50.85]],
	maxBounds: [[2.0, 49.0], [7.2, 51.3]],
	defaultCenter: { lng: 4.5, lat: 50.5 },
	defaultZoom: 8,
	minZoom: 7,
	maxZoom: 20,
	fitBoundsPadding: -50,
	orthophotos: orthophotosWalloniaData.orthophotos as Orthophoto[],
	defaultLensBeforeId: 'ortho-1971',
	defaultLensAfterId: 'ortho-2024',
	hasPositronBasemap: false,
	attribution: 'Made by <a href="https://bsky.app/profile/amcaw.bsky.social" target="_blank">@amcaw</a> - Service public de Wallonie (Licence CC-BY 4.0)',
	maxSourceZoom: 20,
	fitBoundsPaddingAdjust: -50,
	getDynamicMinZoom: (w: number) => w < 640 ? 5.5 : w < 1024 ? 6 : w < 1300 ? 6.5 : 7,
	getTileUrl: (ortho: Orthophoto, tileSize = 256) => {
		return `${ortho.url}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=${tileSize},${tileSize}&format=png32&transparent=true&f=image`;
	},
	geocoder: {
		placeholder: 'Cherchez une adresse en Wallonie',
		searchSuffix: 'Wallonie',
		fallbackCenter: [4.4699, 50.5039],
		isInRegion: (feature: any) => {
			const state = feature.properties?.address?.state;
			const county = feature.properties?.address?.county;
			return (
				state === 'Wallonie' ||
				state === 'Région wallonne' ||
				WALLONIA_PROVINCES.some(
					(province) => county?.includes(province) || state?.includes(province)
				)
			);
		}
	}
};

export const brusselsConfig: RegionConfig = {
	name: 'brussels',
	displayName: 'Bruxelles',
	bounds: [[4.243, 50.764], [4.482, 50.913]],
	maxBounds: [[4.05, 50.65], [4.68, 51.05]],
	defaultCenter: { lng: 4.35, lat: 50.85 },
	defaultZoom: 11,
	minZoom: 10,
	maxZoom: 20,
	fitBoundsPadding: 0,
	orthophotos: orthophotosBrusselsData.orthophotos as Orthophoto[],
	defaultLensBeforeId: 'ortho-1971',
	defaultLensAfterId: 'ortho-2024',
	hasPositronBasemap: true,
	attribution: 'Made by <a href="https://bsky.app/profile/amcaw.bsky.social" target="_blank">@amcaw</a> - Orthophotos: <a href="https://be.brussels/en/about-region/structure-and-organisations/administrations-and-institutions-region/paradigm" target="_blank">Paradigm</a> & <a href="https://bruciel.brussels/" target="_blank">Bruciel</a> (CC-BY)',
	maxSourceZoom: 20,
	fitBoundsPaddingAdjust: 0,
	getDynamicMinZoom: (w: number) => w < 640 ? 9 : w < 1024 ? 9.5 : 10,
	getTileUrl: (ortho: Orthophoto, tileSize = 256) => {
		if (ortho.service === 'urban-brussels' && ortho.crs === 'EPSG:31370') {
			return `${orthophotosBrusselsData.wmsUrbanBrusselsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${ortho.layer}&CRS=EPSG:3857&STYLES=&WIDTH=${tileSize}&HEIGHT=${tileSize}&BBOX={bbox-epsg-3857}`;
		}
		return `${orthophotosBrusselsData.wmsBaseUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=${ortho.layer}&CRS=EPSG:3857&STYLES=&WIDTH=${tileSize}&HEIGHT=${tileSize}&BBOX={bbox-epsg-3857}`;
	},
	geocoder: {
		placeholder: 'Cherchez une adresse à Bruxelles',
		searchSuffix: 'Bruxelles',
		fallbackCenter: [4.3517, 50.8503],
		isInRegion: (feature: any) => {
			const region = feature.properties?.address?.region;
			const state = feature.properties?.address?.state;
			return (
				region?.includes('Bruxelles') ||
				region?.includes('Brussels') ||
				state === 'Bruxelles-Capitale' ||
				state === 'Brussels Hoofdstedelijk Gewest' ||
				state === 'Région de Bruxelles-Capitale' ||
				state === 'Brussels-Capital'
			);
		}
	}
};

// Positron basemap style (shared between Brussels components)
export const positronSource = {
	type: 'raster' as const,
	tiles: [
		'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
		'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
		'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
	],
	tileSize: 256,
	attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>'
};

export const positronLayer = {
	id: 'positron-layer',
	type: 'raster' as const,
	source: 'positron',
	paint: { 'raster-opacity': 1 }
};

// Labels-only overlay for street names on top of orthophotos
export const labelsSource = {
	type: 'raster' as const,
	tiles: [
		'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png',
		'https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png',
		'https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'
	],
	tileSize: 256
};

export const labelsLayer = {
	id: 'labels-layer',
	type: 'raster' as const,
	source: 'labels',
	paint: { 'raster-opacity': 0.85 }
};
