import maplibregl from 'maplibre-gl';

export function mountControls(
	map: maplibregl.Map,
	navigationContainer: HTMLElement,
	attributionContainer: HTMLElement,
	customAttribution: string
) {
	navigationContainer.appendChild(new maplibregl.NavigationControl().onAdd(map));
	const attribution = new maplibregl.AttributionControl({ customAttribution, compact: true }).onAdd(map);
	attributionContainer.appendChild(attribution);
	map.once('idle', () => {
		attribution.classList.remove('maplibregl-compact-show');
		attribution.removeAttribute('open');
	});
}
