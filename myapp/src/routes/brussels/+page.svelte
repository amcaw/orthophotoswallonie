<script>
	import Home from '$lib/Home.svelte';
	import { brusselsConfig } from '$lib/regionConfig';
</script>

<svelte:head>
	<title>Bruxelles vue du ciel</title>
	<meta name="description" content="Comparez les photos aériennes de Bruxelles de 1930 à 2024 : avant/après, loupe et voyage dans le temps." />
</svelte:head>

<Home region={brusselsConfig} />
