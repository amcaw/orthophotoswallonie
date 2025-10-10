<script>
	import MapLens from '$lib/MapLens.svelte';
</script>

<div class="map-container">
	<MapLens />
</div>

<style>
	:global(body) {
		margin: 0 !important;
		padding: 0 !important;
		overflow: visible !important;
		pointer-events: auto !important;
	}

	.map-container {
		position: relative !important;
		width: 100% !important;
		height: 100% !important;
		min-height: 600px !important;
		pointer-events: auto !important;
		touch-action: auto !important;
	}

	:global(.maplibregl-canvas-container),
	:global(.maplibregl-canvas) {
		pointer-events: auto !important;
		touch-action: none !important;
	}
</style>
