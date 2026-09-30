import orthophotosWalloniaData from './orthophotos.json';
import orthophotosBrusselsData from './orthophotosBrussels.json';
import positronStyle from './positronStyle.json';
import type { Map as MaplibreMap, RasterSourceSpecification, StyleSpecification } from 'maplibre-gl';
import { retryUrl } from './tiles';

export interface Orthophoto {
	id: string;
	year: string;
	label: string;
	url?: string;
	layer?: string;
	service?: string;
	crs?: string;
	wmts?: boolean;
	maxzoom?: number;
	partial?: boolean;
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
	getTileUrl: (ortho: Orthophoto) => string;
	hasPositronBasemap: boolean;
	attribution: string;
	geocoder: GeocoderConfig;
	maxSourceZoom: number;
	getDynamicMinZoom: (viewportWidth: number) => number;
	fitBoundsPaddingAdjust: number;
}

const TILE_SIZE = 256;

export function orthoSource(region: RegionConfig, ortho: Orthophoto): RasterSourceSpecification {
	return {
		type: 'raster',
		tiles: [region.getTileUrl(ortho)],
		tileSize: TILE_SIZE,
		maxzoom: ortho.maxzoom ?? region.maxSourceZoom
	};
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
	defaultLensAfterId: 'ortho-2026-printemps',
	hasPositronBasemap: false,
	attribution: 'Made by <a href="https://bsky.app/profile/amcaw.bsky.social" target="_blank">@amcaw</a> - Service public de Wallonie (Licence CC-BY 4.0)',
	maxSourceZoom: 19,
	fitBoundsPaddingAdjust: -50,
	getDynamicMinZoom: (w: number) => w < 640 ? 5.5 : w < 1024 ? 6 : w < 1300 ? 6.5 : 7,
	getTileUrl: (ortho: Orthophoto) =>
		retryUrl(`${ortho.url}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=${TILE_SIZE},${TILE_SIZE}&format=jpgpng&transparent=true&f=image`),
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
	getTileUrl: (ortho: Orthophoto) => {
		if (ortho.wmts) {
			return retryUrl(`${orthophotosBrusselsData.wmtsBaseUrl}/${ortho.layer}/default/EPSG:900913/EPSG:900913:{z}/{y}/{x}?format=image/png`);
		}
		const base = ortho.service === 'urban-brussels' ? orthophotosBrusselsData.wmsUrbanBrusselsUrl : orthophotosBrusselsData.wmsBaseUrl;
		return retryUrl(`${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/vnd.jpeg-png&TRANSPARENT=true&LAYERS=${ortho.layer}&CRS=EPSG:3857&STYLES=&WIDTH=${TILE_SIZE}&HEIGHT=${TILE_SIZE}&BBOX={bbox-epsg-3857}`);
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

const POSITRON_PREFIX = 'positron-';
const LABELS_PREFIX = 'labels-';

const labelLayers = (positronStyle.layers as any[])
	.filter((layer) => layer.type === 'symbol')
	.map((layer) => ({ ...layer, id: LABELS_PREFIX + layer.id }));

export function createBaseStyle(withBasemap: boolean): StyleSpecification {
	return {
		version: 8,
		glyphs: positronStyle.glyphs,
		sprite: positronStyle.sprite,
		sources: structuredClone(positronStyle.sources) as StyleSpecification['sources'],
		layers: withBasemap
			? (positronStyle.layers as any[]).map((layer) => ({ ...layer, id: POSITRON_PREFIX + layer.id }))
			: []
	};
}

export function showLabels(map: MaplibreMap) {
	for (const layer of labelLayers) {
		if (!map.getLayer(layer.id)) map.addLayer(layer);
	}
}

export function hideLabels(map: MaplibreMap) {
	for (const layer of labelLayers) {
		if (map.getLayer(layer.id)) map.removeLayer(layer.id);
	}
}

export function raiseLabels(map: MaplibreMap) {
	for (const layer of labelLayers) {
		if (map.getLayer(layer.id)) map.moveLayer(layer.id);
	}
}
