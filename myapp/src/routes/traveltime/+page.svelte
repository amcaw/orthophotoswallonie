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
