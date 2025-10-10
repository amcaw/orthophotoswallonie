<script>
	import MapTravelInTimeBrussels from '$lib/MapTravelInTimeBrussels.svelte';
</script>

<div class="page-container">
	<MapTravelInTimeBrussels />
</div>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.page-container {
		position: relative;
		width: 100%;
		height: 100vh;
		min-height: 600px;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
</style>
