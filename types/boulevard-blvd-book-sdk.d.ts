declare module '@boulevard/blvd-book-sdk' {
	export class Blvd {
		constructor(apiKey: string, businessID: string, target?: number)
	}

	export const PlatformTarget: {
		Live: number
		Sandbox: number
	}
}
