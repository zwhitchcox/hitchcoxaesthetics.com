import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import {
	NavLink,
	Outlet,
	useLoaderData,
	useLocation,
	useSearchParams,
} from '@remix-run/react'

import { ScrollArea, ScrollBar } from '#app/components/ui/scroll-area'
import { Separator } from '#app/components/ui/separator'
import {
	logout,
	requireFullUser,
	requireUserId,
} from '#app/utils/auth.server.js'
import { getForms } from '#app/utils/client.server.js'
import { cn, useMatchesData } from '#app/utils/misc.js'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export function getNext(
	forms: { slug: string; completed: boolean }[],
	searchParams: URLSearchParams,
	current: string = '',
) {
	const next = forms.find(
		form => form.slug !== current && !form.completed,
	)?.slug
	return next
		? `/account/info/${next}${searchParams.toString()}`
		: searchParams.get('redirectTo')
}

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const userId = await requireUserId(request)
	const user = await requireFullUser(request)
	if (!user) throw await logout({ request })
	const forms = await getForms(userId)
	if (url.pathname === '/account/info') {
		const next = getNext(forms, url.searchParams)
		return redirect(`/account/info/${next ?? forms[0].slug}${url.search}`)
	}

	return { forms }
}

export default function () {
	const { forms } = useLoaderData<typeof loader>()
	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col p-4">
			<div className="space-y-0.5">
				<h2 className="text-2xl font-bold tracking-tight">Client Onboarding</h2>
				<p className="text-muted-foreground">
					Please fill out the following information 24 hours before your
					appointment, so we can have our medical director approve you as a
					client.
				</p>
			</div>
			<Separator className="my-6" />
			<div className="mx-auto grid w-full grid-cols-7 gap-2">
				<ScrollArea className="col-span-7 w-full md:col-span-2 lg:max-w-none">
					<nav className="flex space-x-2  pb-1 md:flex-col lg:space-x-0 lg:space-y-1">
						{forms.map(item => (
							<NavLink
								to={item.slug}
								key={item.slug}
								className={({ isActive }) =>
									cn(
										'flex shrink-0 whitespace-nowrap rounded-lg px-2 py-1  transition-colors',
										isActive
											? 'bg-gray-900 font-medium text-white hover:bg-black'
											: 'hover:bg-transparent hover:underline',
									)
								}
							>
								{item.title}
							</NavLink>
						))}
						<ScrollBar orientation="horizontal" className="invisible" />
					</nav>
				</ScrollArea>
				<div className="col-span-7 md:col-span-5">
					<Outlet />
				</div>
			</div>
		</div>
	)
}

export function useRedirectTo() {
	const { forms } = useMatchesData<typeof loader>(
		'routes/account+/info+/_layout',
	)
	const location = useLocation()
	const cur = location.pathname.split('/').pop()!
	const [searchParams] = useSearchParams()
	return (
		getNext(forms, searchParams, cur) ?? location.pathname + location.search
	)
}
