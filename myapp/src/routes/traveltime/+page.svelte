<script>
	import MapTravelInTime from '$lib/MapTravelInTime.svelte';
</script>

<svelte:head>
	<title>Travel in Time - Orthophotos Wallonie</title>
</svelte:head>

<div class="page-container">
	<MapTravelInTime />
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
