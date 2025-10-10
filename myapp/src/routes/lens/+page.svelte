<script>
	import MapLens from '$lib/MapLens.svelte';
</script>

<div class="map-container">
	<MapLens />
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: visible;
		touch-action: none;
	}

	.map-container {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 800px;
	}
</style>
