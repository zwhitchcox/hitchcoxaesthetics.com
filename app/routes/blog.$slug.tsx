import {
	json,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { MarkdownContent } from '#app/components/markdown-content.js'
import { getSocialMetas } from '#app/utils/seo.ts'
import { getPage } from '#app/utils/site-pages.server.js'
import { ServiceLayout } from './_services+/__service-layout'

export function loader({ params }: LoaderFunctionArgs) {
	const page = getPage(`blog/${params.slug ?? ''}`)
	if (!page?.enabled) throw new Response('Not found', { status: 404 })
	return json({ page })
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
	if (!data) return [{ title: 'Not Found | Sarah Hitchcox Aesthetics' }]
	return getSocialMetas({
		title: data.page.title,
		description: data.page.metaDescription,
		pathname: location.pathname,
	})
}

export default function EducationalArticle() {
	const { page } = useLoaderData<typeof loader>()
	return (
		<ServiceLayout
			title={page.name}
			description={page.tagline}
			imgs={[]}
			showPricingButton={false}
		>
			<article>
				<Link to="/" className="mb-6 inline-block text-sm underline">
					Sarah Hitchcox Aesthetics
				</Link>
				<MarkdownContent content={page.content} />
			</article>
		</ServiceLayout>
	)
}
