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
		overflow: hidden;
	}

	.map-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
	}
</style>
