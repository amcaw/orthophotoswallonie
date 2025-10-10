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
		position: relative;
		width: 100%;
		height: 100vh;
		min-height: 600px;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
</style>
