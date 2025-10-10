<script>
	import favicon from '$lib/assets/favicon.svg';
	import CookieConsent from '$lib/CookieConsent.svelte';
	import { onMount } from 'svelte';
	import pym from 'pym.js';

	let { children } = $props();
	let pymChild = $state(/** @type {import('pym.js').Child | null} */ (null));

	onMount(() => {
		// Initialize pym.js child
		pymChild = new pym.Child({
			polling: 500,
			renderCallback: () => {
				// Force initial height calculation with actual viewport height
				if (pymChild) {
					const sendActualHeight = () => {
						// Get the actual viewport height
						const height = Math.max(
							document.documentElement.scrollHeight,
							document.documentElement.offsetHeight,
							document.body.scrollHeight,
							document.body.offsetHeight,
							window.innerHeight
						);
						// Send the height directly
						pymChild.sendMessage('height', height.toString());
					};

					setTimeout(sendActualHeight, 50);
					setTimeout(sendActualHeight, 200);
					setTimeout(sendActualHeight, 500);
					setTimeout(sendActualHeight, 1000);
					setTimeout(sendActualHeight, 2000);
				}
			}
		});

		// Also send height on window resize
		const handleResize = () => {
			if (pymChild) {
				const height = Math.max(
					document.documentElement.scrollHeight,
					document.documentElement.offsetHeight,
					document.body.scrollHeight,
					document.body.offsetHeight,
					window.innerHeight
				);
				pymChild.sendMessage('height', height.toString());
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
