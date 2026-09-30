export interface ViewState {
	lat: number;
	lng: number;
	zoom: number;
	years: string[];
}

export function parseHash(hash: string): ViewState | null {
	const parts = hash.replace(/^#/, '').split(',');
	if (parts.length < 3) return null;
	const lat = parseFloat(parts[0]);
	const lng = parseFloat(parts[1]);
	const zoom = parseFloat(parts[2].replace('z', ''));
	if ([lat, lng, zoom].some(Number.isNaN)) return null;
	return { lat, lng, zoom, years: parts.slice(3).filter(Boolean).map(decodeURIComponent) };
}

export function readHash(): ViewState | null {
	if (typeof window === 'undefined') return null;
	return parseHash(window.location.hash);
}

export function formatHash({ lat, lng, zoom, years }: ViewState) {
	return [lat.toFixed(6), lng.toFixed(6), `${zoom.toFixed(2)}z`, ...years.map(encodeURIComponent)].join(',');
}

export function writeHash(state: ViewState) {
	if (typeof window === 'undefined') return;
	const hash = `#${formatHash(state)}`;
	if (window.location.hash === hash) return;
	history.replaceState(history.state, '', hash);
}

export function currentUrl() {
	if (typeof window === 'undefined') return '';
	return `${window.location.origin}${window.location.pathname}${window.location.hash}`;
}
