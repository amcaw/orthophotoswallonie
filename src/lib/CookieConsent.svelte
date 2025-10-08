<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let showBanner = $state(false);
	let hasConsented = $state(false);

	onMount(() => {
		// Check if user has already made a choice
		const consent = localStorage.getItem('cookie-consent');
		if (consent === null) {
			showBanner = true;
		} else if (consent === 'accepted') {
			hasConsented = true;
			loadGTM();
		}
	});

	function loadGTM() {
		if (!browser) return;

		(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
		new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
		j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
		'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
		})(window,document,'script','dataLayer','GTM-TPNMK7FK');
	}

	function acceptCookies() {
		localStorage.setItem('cookie-consent', 'accepted');
		hasConsented = true;
		showBanner = false;
		loadGTM();
	}

	function refuseCookies() {
		localStorage.setItem('cookie-consent', 'refused');
		showBanner = false;
	}
</script>

{#if showBanner}
	<div class="cookie-banner">
		<div class="cookie-content">
			<div class="cookie-text">
				<h3>Nous utilisons des cookies</h3>
				<p>Ce site utilise Google Analytics uniquement pour comptabiliser le nombre de vues sur la page. Vos données ne sont pas utilisées à des fins de marketing. Vous avez le choix d'accepter ou de refuser ces cookies.</p>
			</div>
			<div class="cookie-buttons">
				<button class="btn-refuse" onclick={refuseCookies}>Refuser</button>
				<button class="btn-accept" onclick={acceptCookies}>Accepter</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.cookie-banner {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.95);
		color: white;
		padding: 20px;
		z-index: 9999;
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(10px);
	}

	.cookie-content {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}

	.cookie-text h3 {
		margin: 0 0 8px 0;
		font-size: 18px;
		font-weight: 700;
	}

	.cookie-text p {
		margin: 0;
		font-size: 14px;
		opacity: 0.9;
	}

	.cookie-buttons {
		display: flex;
		gap: 12px;
	}

	button {
		padding: 10px 24px;
		border: none;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-accept {
		background: #4a90e2;
		color: white;
	}

	.btn-accept:hover {
		background: #357abd;
	}

	.btn-refuse {
		background: transparent;
		color: white;
		border: 2px solid rgba(255, 255, 255, 0.3);
	}

	.btn-refuse:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.5);
	}

	@media (max-width: 640px) {
		.cookie-content {
			flex-direction: column;
			align-items: stretch;
		}

		.cookie-buttons {
			flex-direction: column;
		}

		button {
			width: 100%;
		}
	}
</style>
