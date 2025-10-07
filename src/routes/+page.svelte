<script>
	import { base } from '$app/paths';
</script>

<div class="home-container">
	<h1>Comparateur d'orthophotos Wallonie</h1>
	<p>Comparez les images aériennes de 1971 et 2023</p>

	<div class="links">
		<a href="{base}/lens" class="card">
			<h2>Mode Loupe</h2>
			<p>Comparez avec une loupe circulaire</p>
		</a>

		<a href="{base}/timelapse" class="card">
			<h2>Mode Timelapse</h2>
			<p>Comparez n'importe quelle année</p>
		</a>

		<a href="{base}/traveltime" class="card">
			<h2>Travel in Time</h2>
			<p>Voyagez à travers toutes les années</p>
		</a>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.home-container {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 2rem;
	}

	h1 {
		font-size: 3rem;
		margin-bottom: 0.5rem;
		text-align: center;
	}

	p {
		font-size: 1.2rem;
		opacity: 0.9;
		margin-bottom: 3rem;
		text-align: center;
	}

	.links {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
		justify-content: center;
	}

	.card {
		background: white;
		color: #333;
		padding: 2rem;
		border-radius: 12px;
		text-decoration: none;
		transition: transform 0.2s, box-shadow 0.2s;
		min-width: 250px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.card:hover {
		transform: translateY(-4px);
		box-shadow: 0 8px 12px rgba(0, 0, 0, 0.2);
	}

	.card h2 {
		margin: 0 0 0.5rem 0;
		color: #667eea;
	}

	.card p {
		margin: 0;
		color: #666;
		font-size: 1rem;
	}
</style>
