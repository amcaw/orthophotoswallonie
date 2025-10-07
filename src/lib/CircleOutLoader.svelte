<div class="circle-out-loader">
	<div class="circle-out"></div>
</div>

<style>
	.circle-out-loader {
		position: relative;
		margin: 0 auto 1rem auto;
		height: 150px;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.circle-out {
		position: relative;
		margin: 0 auto;
		padding: 0;
		width: 0;
		height: 0;
		font-size: 300%;
	}

	.circle-out:before {
		position: relative;
		top: -0.8em;
		left: -1em;
		display: block;
		box-sizing: border-box;
		margin: 0 auto;
		width: 2em;
		height: 2em;
		border: 0.5em solid #0ea5e9;
		border-radius: 100%;
		content: '';
		transform-origin: center;
		animation-name: fadeOut;
		animation-duration: 1s;
		animation-timing-function: ease-in-out;
		animation-delay: -1s;
		animation-iteration-count: infinite;
		animation-direction: forwards;
	}

	.circle-out:after {
		position: absolute;
		top: -0.8em;
		left: -1em;
		display: block;
		box-sizing: border-box;
		margin: 0 auto;
		width: 2em;
		height: 2em;
		border: 0.2em solid #0ea5e9;
		border-radius: 100%;
		content: '';
		transform-origin: center;
		animation-name: fadeOut;
		animation-duration: 1s;
		animation-timing-function: ease;
		animation-delay: -0.5s;
		animation-iteration-count: infinite;
		animation-direction: forwards;
	}

	@keyframes fadeOut {
		0% {
			transform: scale(0);
		}
		50% {
			opacity: 1;
		}
		100% {
			transform: scale(1);
			opacity: 0;
		}
	}
</style>
