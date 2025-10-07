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
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.page-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
</style>
