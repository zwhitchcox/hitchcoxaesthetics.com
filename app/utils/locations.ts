export const locations = [
	{
		id: 'bearden',
		name: 'Bearden',
		displayName: 'Knoxville (Bearden)',
		address: '5113 Kingston Pike Suite 15',
		city: 'Knoxville',
		state: 'TN',
		zip: '37919',
		phone: '(865) 489-8008',
		phoneRaw: '8654898008',
		lat: 35.9392,
		lng: -83.9913,
		googleMapsEmbedUrl:
			'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d6460.633842232989!2d-83.99134928806535!3d35.93921647239054!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x885c3daeef676e4f%3A0x36d0dab4a91039cb!2sSarah%20Hitchcox%20Aesthetics!5e0!3m2!1sen!2sus!4v1753285704557!5m2!1sen!2sus',
		googleMapsDirectionsUrl:
			'https://maps.google.com/?q=5113+Kingston+Pike+Suite+15,+Knoxville,+TN+37919',
	},
	{
		id: 'farragut',
		name: 'Farragut',
		displayName: 'Farragut',
		address: '102 S Campbell Station Rd Suite 8',
		city: 'Knoxville',
		state: 'TN',
		zip: '37934',
		phone: '(865) 489-8001',
		phoneRaw: '8654898001',
		lat: 35.8804,
		lng: -84.1616,
		googleMapsEmbedUrl:
			'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d6465.438458287701!2d-84.16162298806765!3d35.88039687240895!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x885c2febbcf5149d%3A0x42a506d560dfab04!2sSarah%20Hitchcox%20Aesthetics!5e0!3m2!1sen!2sus!4v1753285747631!5m2!1sen!2sus',
		googleMapsDirectionsUrl:
			'https://maps.google.com/?q=102+S+Campbell+Station+Rd+Suite+8,+Knoxville,+TN+37934',
	},
] as const

export type Location = (typeof locations)[number]

/** Phone number — CallRail will swap this dynamically for tracking */
export const PHONE = '(865) 489-8008'
export const PHONE_RAW = '8654898008'

export function getLocationById(id: string): Location | undefined {
	return locations.find(location => location.id === id)
}

export function formatAddress(location: Location): string {
	return `${location.address}, ${location.city}, ${location.state} ${location.zip}`
}
