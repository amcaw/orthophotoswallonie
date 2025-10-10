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
