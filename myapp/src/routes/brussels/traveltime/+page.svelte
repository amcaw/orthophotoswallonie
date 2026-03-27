<script>
	import MapTravelInTime from '$lib/MapTravelInTime.svelte';
	import { brusselsConfig } from '$lib/regionConfig';
</script>

<svelte:head>
	<title>Voyage dans le temps - Orthophotos Bruxelles</title>
	<meta name="description" content="Voyagez dans le temps à travers les orthophotos de Bruxelles de 1930 à 2024 de manière animée." />
</svelte:head>

<div class="page-container">
	<MapTravelInTime region={brusselsConfig} />
</div>

<style>
	:global(body) {
		margin: 0 !important;
		padding: 0 !important;
		overflow: visible !important;
		pointer-events: auto !important;
	}

	.page-container {
		position: relative !important;
		width: 100% !important;
		height: 100% !important;
		min-height: 600px !important;
		margin: 0 !important;
		padding: 0 !important;
		pointer-events: auto !important;
		touch-action: auto !important;
	}

	:global(.maplibregl-canvas-container),
	:global(.maplibregl-canvas) {
		pointer-events: auto !important;
		touch-action: none !important;
	}
</style>
