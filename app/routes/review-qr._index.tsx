import { json, type MetaFunction } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { listProviders } from '#app/utils/review-link.server.ts'

export const meta: MetaFunction = () => [
	{ title: 'Review QR codes · Sarah Hitchcox Aesthetics' },
	{ name: 'robots', content: 'noindex' },
]

export async function loader() {
	const providers = await listProviders()
	return json({ providers })
}

export default function ReviewQrIndex() {
	const { providers } = useLoaderData<typeof loader>()
	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-10">
			<header className="text-center">
				<h1 className="text-2xl font-semibold">Review QR codes</h1>
				<p className="mt-2 text-muted-foreground">
					Open a provider to print or display their review QR code.
				</p>
			</header>
			<ul className="flex flex-col gap-2">
				{providers.map(p => (
					<li key={p.id}>
						<Link
							to={`/review-qr/${p.uuid}`}
							className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition hover:border-primary"
						>
							<span className="font-medium">{p.name}</span>
							<span className="text-sm text-primary">Open QR →</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	)
}
