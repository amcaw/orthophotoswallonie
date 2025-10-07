<script>
	import { base } from '$app/paths';
</script>

<div class="home-container">
	<h1>Comparateur d'orthophotos Wallonie</h1>
	<p>Comparez les images aériennes de 1971 à 2023</p>

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
		background: white;
	}

	.home-container {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		color: #333;
		font-weight: 600;
	}

	p {
		font-size: 1.1rem;
		margin-bottom: 3rem;
		color: #666;
	}

	.links {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
		justify-content: center;
		width: 100%;
	}

	.card {
		background: white;
		color: #333;
		padding: 2rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		text-decoration: none;
		transition: all 0.2s;
		flex: 1;
		min-width: 220px;
		max-width: 300px;
	}

	.card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
	}

	.card h2 {
		margin: 0 0 0.5rem 0;
		color: #1f2937;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.card p {
		margin: 0;
		color: #6b7280;
		font-size: 0.95rem;
	}

	@media (max-width: 768px) {
		h1 {
			font-size: 2rem;
		}

		p {
			font-size: 1rem;
		}

		.card {
			max-width: 100%;
		}
	}
</style>
