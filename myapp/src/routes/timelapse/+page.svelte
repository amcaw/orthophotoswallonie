<script lang="ts">
	import MapTimelapse from '$lib/MapTimelapse.svelte';
</script>

<svelte:head>
	<title>Timelapse - Comparaison d'orthophotos</title>
</svelte:head>

<div class="page-container">
	<MapTimelapse />
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}

	.page-container {
		position: relative;
		width: 100%;
		height: 100vh;
		min-height: 800px;
		margin: 0;
		padding: 0;
		overflow: hidden;
	}
</style>
