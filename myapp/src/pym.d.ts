declare module 'pym.js' {
	export class Child {
		constructor(config?: { polling?: number; renderCallback?: () => void; id?: string });
		sendHeight(): void;
		sendMessage(messageType: string, message: string): void;
		remove(): void;
		onMessage(messageType: string, callback: (message: string) => void): void;
	}

	export class Parent {
		constructor(
			id: string,
			url: string,
			config?: {
				xdomain?: string;
				title?: string;
				name?: string;
				scrollwait?: number;
				parenturlparam?: string;
			}
		);
		sendMessage(messageType: string, message: string): void;
		remove(): void;
		onMessage(messageType: string, callback: (message: string) => void): void;
	}

	const pym: {
		Child: typeof Child;
		Parent: typeof Parent;
	};

	export default pym;
}
