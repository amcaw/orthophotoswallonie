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
	}

	.map-container {
		position: relative;
		width: 100%;
		height: 100vh;
		min-height: 800px;
	}
</style>
