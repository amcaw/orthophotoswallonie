<script>
	import favicon from '$lib/assets/favicon.svg';
	import CookieConsent from '$lib/CookieConsent.svelte';
	import { onMount } from 'svelte';
	import pym from 'pym.js';

	let { children } = $props();
	let pymChild = $state(/** @type {import('pym.js').Child | null} */ (null));

	onMount(() => {
		// Initialize pym.js child
		pymChild = new pym.Child({ polling: 500 });

		// Return cleanup function
		return () => {
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
