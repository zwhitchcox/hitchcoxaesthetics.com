import { loadAllLocationPages } from './content-loader.server.js'
import { type LocationServiceData } from './section-types.js'

export type {
	ServicePageSection,
	LocationServiceData,
} from './section-types.js'

// ---------------------------------------------------------------------------
// Load all location service pages from content/knoxville/ and content/farragut/
// ---------------------------------------------------------------------------

export const locationServices: Record<string, LocationServiceData> =
	loadAllLocationPages()

export function getLocationServices(locationId: string) {
	return Object.values(locationServices).filter(
		service => service.locationId === locationId,
	)
}
