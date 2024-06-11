import { SEOHandle } from '@nasa-gcn/remix-seo'
import { useParams } from '@remix-run/react'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export default function () {
	const { slug } = useParams()
	return <div>slug: {slug}</div>
}
