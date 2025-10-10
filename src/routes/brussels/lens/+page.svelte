<script>
	import MapLensBrussels from '$lib/MapLensBrussels.svelte';
</script>

<div class="page-container">
	<MapLensBrussels />
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.page-container {
		width: 100%;
		height: 100vh;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
</style>
