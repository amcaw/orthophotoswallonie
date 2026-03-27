<script lang="ts">
	import MapTimelapse from '$lib/MapTimelapse.svelte';
	import { walloniaConfig } from '$lib/regionConfig';
</script>

<svelte:head>
	<title>Timelapse - Comparaison d'orthophotos Wallonie</title>
	<meta name="description" content="Comparez les orthophotos de la Wallonie en mode avant-après avec un curseur interactif." />
</svelte:head>

<div class="page-container">
	<MapTimelapse region={walloniaConfig} />
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
