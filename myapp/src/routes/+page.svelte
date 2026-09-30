<script>
	import Home from '$lib/Home.svelte';
	import { walloniaConfig } from '$lib/regionConfig';
</script>

<svelte:head>
	<title>La Wallonie vue du ciel</title>
	<meta name="description" content="Comparez les photos aériennes de la Wallonie de 1971 à 2026 et les cartes anciennes depuis 1770 : avant/après, loupe et voyage dans le temps." />
</svelte:head>

<Home region={walloniaConfig} />
