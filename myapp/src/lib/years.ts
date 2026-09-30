import type { Orthophoto } from './regionConfig';

export interface YearOption {
	id: string;
	year: string;
	season: string | null;
	partial: boolean;
	layers: Orthophoto[];
}

export interface YearEntry {
	id: string;
	year: string;
	startYear: number;
	kind: 'photo' | 'map';
	title: string | null;
	combined: YearOption;
	seasons: YearOption[];
}

const SEASON_ORDER = ['printemps', 'été'];

function seasonOf(ortho: Orthophoto): string | null {
	const match = ortho.year.match(/(printemps|été|ete)/i);
	if (!match) return null;
	const season = match[1].toLowerCase();
	return season === 'ete' ? 'été' : season;
}

function seasonRank(ortho: Orthophoto) {
	const index = SEASON_ORDER.indexOf(seasonOf(ortho) ?? '');
	return index === -1 ? SEASON_ORDER.length : index;
}

export function buildYears(orthophotos: Orthophoto[]): YearEntry[] {
	const byYear = new Map<string, Orthophoto[]>();
	for (const ortho of orthophotos) {
		const year = ortho.year.split(' ')[0];
		byYear.set(year, [...(byYear.get(year) ?? []), ortho]);
	}

	return [...byYear.entries()].map(([year, unsorted]) => {
		const layers = unsorted.slice().sort((a, b) => seasonRank(a) - seasonRank(b));
		const seasons = layers.map(seasonOf).filter((s): s is string => !!s);
		const isMap = !layers[0].id.startsWith('ortho-');
		return {
			id: year,
			year,
			startYear: parseInt(year, 10),
			kind: isMap ? 'map' : 'photo',
			title: isMap ? layers[0].label : null,
			combined: {
				id: year,
				year,
				season: seasons.length ? seasons.join(' + ') : null,
				partial: layers.length === 1 && !!layers[0].partial,
				layers
			},
			seasons:
				layers.length > 1
					? layers.map((ortho) => ({
							id: ortho.id,
							year,
							season: seasonOf(ortho),
							partial: !!ortho.partial,
							layers: [ortho]
						}))
					: []
		};
	});
}

export function allOptions(entries: YearEntry[]) {
	return entries.flatMap((entry) => [entry.combined, ...entry.seasons]);
}

export function findOption(entries: YearEntry[], id: string | undefined): YearOption | undefined {
	if (!id) return undefined;
	const direct = allOptions(entries).find((option) => option.id === id);
	if (direct) return direct;
	return entries.find((entry) => entry.combined.layers.some((layer) => layer.id === id))?.combined;
}

export function entryOf(entries: YearEntry[], option: YearOption) {
	return entries.find((entry) => entry.year === option.year)!;
}

export function optionLabel(option: YearOption) {
	return option.season && option.layers.length === 1 && option.id !== option.year
		? `${option.year} (${option.season})`
		: option.year;
}

export function layerIds(option: YearOption) {
	return option.layers.map((ortho) => `${ortho.id}-layer`);
}
