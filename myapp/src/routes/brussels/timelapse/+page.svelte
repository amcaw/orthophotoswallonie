<script>
	import MapTimelapseBrussels from '$lib/MapTimelapseBrussels.svelte';
</script>

<div class="page-container">
	<MapTimelapseBrussels />
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: visible;
		touch-action: none;
	}

	.page-container {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 800px;
		margin: 0;
		padding: 0;
	}
</style>
