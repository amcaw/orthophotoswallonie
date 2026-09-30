import maplibregl from 'maplibre-gl';

const PROTOCOL = 'retry';
const RETRY_DELAYS_MS = [500, 1500, 4000];
const SOURCES_LOADED_TIMEOUT_MS = 20000;

let registered = false;

class PermanentTileError extends Error {}

function wait(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true }
		);
	});
}

async function loadOnce(url: string, signal: AbortSignal) {
	const response = await fetch(url, { signal });
	const isImage = response.headers.get('content-type')?.startsWith('image/');
	if (response.ok && isImage) return response.arrayBuffer();
	if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
		throw new PermanentTileError(`${response.status} ${url}`);
	}
	throw new Error(`${response.status} ${url}`);
}

async function loadTile(url: string, signal: AbortSignal) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await loadOnce(url, signal);
		} catch (error) {
			const exhausted = attempt === RETRY_DELAYS_MS.length;
			if (signal.aborted || error instanceof PermanentTileError || exhausted) throw error;
			await wait(RETRY_DELAYS_MS[attempt], signal);
		}
	}
}

export function registerTileRetry() {
	if (registered) return;
	registered = true;
	maplibregl.addProtocol(PROTOCOL, async (params, abortController) => ({
		data: await loadTile(params.url.replace(`${PROTOCOL}://`, 'https://'), abortController.signal)
	}));
}

export function retryUrl(url: string) {
	return url.replace(/^https:\/\//, `${PROTOCOL}://`);
}

export function whenSourcesLoaded(map: maplibregl.Map, sourceIds: string[]) {
	return new Promise<void>((resolve) => {
		const check = () => {
			try {
				return sourceIds.every((id) => !map.getSource(id) || map.isSourceLoaded(id));
			} catch {
				return true;
			}
		};
		const finish = () => {
			map.off('sourcedata', onChange);
			map.off('idle', onChange);
			clearTimeout(timer);
			resolve();
		};
		const onChange = () => {
			if (check()) finish();
		};
		const timer = setTimeout(finish, SOURCES_LOADED_TIMEOUT_MS);
		map.once('render', () => {
			map.on('sourcedata', onChange);
			map.on('idle', onChange);
			onChange();
		});
		map.triggerRepaint();
	});
}

export function isMapAlive(map: maplibregl.Map) {
	try {
		return !!map.getStyle();
	} catch {
		return false;
	}
}
