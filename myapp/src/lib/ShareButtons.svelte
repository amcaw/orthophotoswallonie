<script lang="ts">
	export let lat: number;
	export let lng: number;
	export let zoom: number;
	export let shareText: string = '';
	export let yearBefore: string | undefined = undefined;
	export let yearAfter: string | undefined = undefined;
	export let year: string | undefined = undefined;

	// Convert decimal degrees to degrees, minutes, seconds
	function toDMS(decimal: number, isLat: boolean): string {
		const absolute = Math.abs(decimal);
		const degrees = Math.floor(absolute);
		const minutesDecimal = (absolute - degrees) * 60;
		const minutes = Math.floor(minutesDecimal);
		const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);

		const direction = isLat
			? (decimal >= 0 ? 'N' : 'S')
			: (decimal >= 0 ? 'E' : 'O');

		return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
	}

	$: latDMS = toDMS(lat, true);
	$: lngDMS = toDMS(lng, false);
	$: coordinates = `${latDMS} ${lngDMS}`;

	// Extract year from ortho-YYYY format
	function extractYear(yearId: string | undefined): string {
		if (!yearId) return '';
		return yearId.replace('ortho-', '');
	}

	// Generate URL with hash, removing any existing hash first
	// Include year parameters if provided
	$: hashParts = [
		lat.toFixed(6),
		lng.toFixed(6),
		`${zoom.toFixed(2)}z`,
		...(yearBefore && yearAfter ? [yearBefore, yearAfter] : year ? [year] : [])
	];
	$: url = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}${window.location.search}#${hashParts.join(',')}` : '';

	// Build share text with proper format
	let text: string;
	$: {
		if (shareText) {
			text = shareText;
		} else if (yearBefore && yearAfter) {
			const region = typeof window !== 'undefined' && window.location.pathname.includes('brussels') ? 'Bruxelles' : 'la Wallonie';
			text = `À quoi ressemblait ${region} en ${extractYear(yearBefore)} vs. ${extractYear(yearAfter)} à ${coordinates} ? Suivez ce lien pour le savoir`;
		} else if (year) {
			const region = typeof window !== 'undefined' && window.location.pathname.includes('brussels') ? 'Bruxelles' : 'la Wallonie';
			text = `À quoi ressemblait ${region} en ${extractYear(year)} à ${coordinates} ? Suivez ce lien pour le savoir`;
		} else {
			const region = typeof window !== 'undefined' && window.location.pathname.includes('brussels') ? 'Bruxelles' : 'la Wallonie';
			text = `À quoi ressemblait ${region} à ${coordinates} ? Suivez ce lien pour le savoir`;
		}
	}

	$: encodedUrl = encodeURIComponent(url);
	$: encodedText = encodeURIComponent(text);

	const shareLinks = {
		linkedin: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
		twitter: () => `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
		whatsapp: () => `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
		facebook: () => `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
		bluesky: () => `https://bsky.app/intent/compose?text=${encodedText}%20${encodedUrl}`,
	};

	function share(platform: keyof typeof shareLinks) {
		window.open(shareLinks[platform](), '_blank', 'width=600,height=400');
	}

</script>

<div class="share-buttons">
	<button on:click={() => share('linkedin')} title="Share on LinkedIn" aria-label="Share on LinkedIn">
		<svg viewBox="0 0 24 24" fill="currentColor">
			<path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
		</svg>
	</button>

	<button on:click={() => share('twitter')} title="Share on X (Twitter)" aria-label="Share on X">
		<svg viewBox="0 0 24 24" fill="currentColor">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
		</svg>
	</button>

	<button on:click={() => share('whatsapp')} title="Share on WhatsApp" aria-label="Share on WhatsApp">
		<svg viewBox="0 0 24 24" fill="currentColor">
			<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
		</svg>
	</button>

	<button on:click={() => share('facebook')} title="Share on Facebook" aria-label="Share on Facebook">
		<svg viewBox="0 0 24 24" fill="currentColor">
			<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
		</svg>
	</button>

	<button on:click={() => share('bluesky')} title="Share on Bluesky" aria-label="Share on Bluesky">
		<svg viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.038.415-.054-.265.019-.538.036-.813.049-2.568.124-5.279.835-6.121 2.255-.462.779-.382 1.565-.382 2.391 0 .78.291 1.788.921 2.257 1.274.948 4.046.972 6.798-.906C10.552 17.39 11.416 14.41 12 12.55c.584 1.86 1.448 4.84 4.175 6.953 2.752 1.878 5.524 1.854 6.798.906.63-.469.921-1.477.921-2.257 0-.826.08-1.612-.382-2.391-.842-1.42-3.553-2.131-6.121-2.255-.275-.013-.548-.03-.813-.049.14.016.279.034.415.054 2.67.296 5.568-.628 6.383-3.364.246-.829.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>
		</svg>
	</button>
</div>

<style>
	.share-buttons {
		position: absolute;
		bottom: 60px;
		right: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 150;
		background: rgba(255, 255, 255, 0.9);
		backdrop-filter: blur(4px);
		padding: 8px;
		border-radius: 4px;
		box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
		pointer-events: auto !important;
	}

	button {
		width: 32px;
		height: 32px;
		padding: 6px;
		background: transparent;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #333;
		pointer-events: auto !important;
		touch-action: manipulation;
	}

	button:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	button:active {
		background: rgba(0, 0, 0, 0.1);
		transform: scale(0.95);
	}

	svg {
		width: 20px;
		height: 20px;
		pointer-events: none;
	}

	/* Platform-specific colors on hover */
	button:nth-child(1):hover { color: #0077b5; } /* LinkedIn */
	button:nth-child(2):hover { color: #000; } /* X/Twitter */
	button:nth-child(3):hover { color: #25d366; } /* WhatsApp */
	button:nth-child(4):hover { color: #1877f2; } /* Facebook */
	button:nth-child(5):hover { color: #1285fe; } /* Bluesky */

	@media (max-width: 768px) {
		.share-buttons {
			bottom: 70px;
			right: 5px;
			padding: 8px;
			gap: 8px;
		}

		button {
			/* Larger touch targets for mobile - 44x44px minimum recommended */
			width: 40px;
			height: 40px;
			min-width: 44px;
			min-height: 44px;
			padding: 8px;
		}

		svg {
			width: 22px;
			height: 22px;
		}
	}
</style>
