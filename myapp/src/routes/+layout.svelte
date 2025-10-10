<script>
	import favicon from '$lib/assets/favicon.svg';
	import CookieConsent from '$lib/CookieConsent.svelte';
	import { onMount } from 'svelte';
	import pym from 'pym.js';

	let { children } = $props();
	let pymChild = $state(/** @type {import('pym.js').Child | null} */ (null));

	onMount(() => {
		// Initialize pym.js child with polling disabled initially
		pymChild = new pym.Child({ polling: 0 });

		// Force height updates using the correct API
		const forceHeightUpdate = () => {
			if (pymChild) {
				pymChild.sendHeight();
			}
		};

		// Send height multiple times as content loads
		setTimeout(forceHeightUpdate, 100);
		setTimeout(forceHeightUpdate, 300);
		setTimeout(forceHeightUpdate, 500);
		setTimeout(forceHeightUpdate, 1000);
		setTimeout(forceHeightUpdate, 2000);

		// Enable polling after initial load
		setTimeout(() => {
			// Re-initialize with polling enabled
			if (pymChild) {
				pymChild.remove();
			}
			pymChild = new pym.Child({ polling: 500 });
		}, 2500);

		// Send height on window resize
		const handleResize = () => {
			if (pymChild) {
				pymChild.sendHeight();
			}
		};
		window.addEventListener('resize', handleResize);

		// Return cleanup function
		return () => {
			window.removeEventListener('resize', handleResize);
			if (pymChild) {
				pymChild.remove();
			}
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Zalando+Sans:wght@400;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<CookieConsent />

{@render children?.()}
