<script>
	import favicon from '$lib/assets/favicon.svg';
	import CookieConsent from '$lib/CookieConsent.svelte';
	import { onMount } from 'svelte';
	import pym from 'pym.js';

	let { children } = $props();
	let pymChild = $state(/** @type {import('pym.js').Child | null} */ (null));

	// Parent page header height to account for
	const PARENT_HEADER_HEIGHT = 150;

	onMount(() => {
		// Check if we're in an iframe
		const isInIframe = window.self !== window.top;

		// Apply overflow control based on mode
		if (!isInIframe) {
			// Standalone mode: hide overflow to prevent scrollbars
			document.documentElement.style.overflow = 'hidden';
			document.body.style.overflow = 'hidden';
		} else {
			// Iframe mode: allow overflow for proper height calculation
			document.documentElement.style.overflow = 'visible';
			document.body.style.overflow = 'visible';
		}

		// Calculate target height - use available space
		const calculateTargetHeight = () => {
			if (isInIframe) {
				// In iframe: use the space given by parent (accounting for header)
				// Use window.innerHeight which reflects iframe's actual height
				return window.innerHeight;
			} else {
				// Standalone: use full viewport or minimum
				return Math.max(window.innerHeight, 600);
			}
		};

		// Set dynamic height on the app container
		const updateContainerHeight = () => {
			const targetHeight = calculateTargetHeight();
			const svelte = document.getElementById('svelte');
			if (svelte) {
				svelte.style.height = `${targetHeight}px`;
				svelte.style.minHeight = `${targetHeight}px`;
			}

			// Also update body height for proper pym.js measurement
			document.body.style.height = `${targetHeight}px`;
		};

		// Initialize pym.js child
		pymChild = new pym.Child({ polling: 0 });

		// Force height updates
		const forceHeightUpdate = () => {
			if (pymChild) {
				updateContainerHeight();
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
			if (pymChild) {
				pymChild.remove();
			}
			pymChild = new pym.Child({ polling: 500 });
		}, 2500);

		// Send height on window resize
		const handleResize = () => {
			if (pymChild) {
				updateContainerHeight();
				pymChild.sendHeight();
			}
		};
		window.addEventListener('resize', handleResize);

		// Update height when parent resizes the iframe
		const resizeObserver = new ResizeObserver(() => {
			updateContainerHeight();
			if (pymChild) {
				setTimeout(() => pymChild.sendHeight(), 50);
			}
		});
		resizeObserver.observe(document.body);

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
