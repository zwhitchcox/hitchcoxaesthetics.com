import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type HeadersFunction,
	json,
	type LinksFunction,
	type LoaderFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import {
	Form,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useFetcher,
	useFetchers,
	useLoaderData,
	useLocation,
	useMatches,
	useSubmit,
} from '@remix-run/react'
import { withSentry } from '@sentry/remix'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HoneypotProvider } from 'remix-utils/honeypot/react'
import { useHydrated } from 'remix-utils/use-hydrated'
import { z } from 'zod'

import { GeneralErrorBoundary } from '#/app/components/error-boundary.tsx'
import { ListWithDot } from '#/app/components/list-with-dot'
import Logo from '#/app/components/logo'
import { EpicProgress } from '#/app/components/progress-bar.tsx'
import { SearchBar } from '#/app/components/search-bar.tsx'
import { useToast } from '#/app/components/toaster.tsx'
import { Button } from '#/app/components/ui/button.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuTrigger,
} from '#/app/components/ui/dropdown-menu.tsx'
import { Icon } from '#/app/components/ui/icon.tsx'
import { EpicToaster } from '#/app/components/ui/sonner.tsx'
import '#/app/styles/global.css'
import tailwindStyleSheetUrl from '#/app/styles/tailwind.css?url'
import { getUserId, logout } from '#/app/utils/auth.server.ts'
import {
	ClientHintCheck,
	getHints,
	useHints,
} from '#/app/utils/client-hints.tsx'
import { prisma } from '#/app/utils/db.server.ts'
import { getEnv } from '#/app/utils/env.server.ts'
import { honeypot } from '#/app/utils/honeypot.server.ts'
import { locations, formatAddress } from '#/app/utils/locations.ts'
import {
	addGTM,
	combineHeaders,
	getDomainUrl,
	getUserImgSrc,
} from '#/app/utils/misc.tsx'
import { useNonce } from '#/app/utils/nonce-provider.ts'
import { useRequestInfo } from '#/app/utils/request-info.ts'
import { setTheme, type Theme } from '#/app/utils/theme.server.ts'
import { makeTimings, time } from '#/app/utils/timing.server.ts'
import { getToast } from '#/app/utils/toast.server.ts'
import { useOptionalUser, useUser } from '#/app/utils/user.ts'
import { locationServices } from '#/app/utils/location-service-data.server.ts'
import { menuLinks } from '#/app/utils/menu-links.server.ts'
import { isServicePage } from '#/app/utils/site-pages.server.ts'
import { CTA } from './utils/cta'

export const links: LinksFunction = () => {
	return [
		{ rel: 'preload', href: tailwindStyleSheetUrl, as: 'style' },
		// Preload CSS as a resource to avoid render blocking
		{ rel: 'mask-icon', href: '/favicons/mask-icon.svg' },
		{
			rel: 'alternate icon',
			type: 'image/png',
			href: '/favicons/favicon-32x32.png',
		},
		{ rel: 'apple-touch-icon', href: '/favicons/apple-touch-icon.png' },
		{
			rel: 'manifest',
			href: '/site.webmanifest',
			crossOrigin: 'use-credentials',
		} as const, // necessary to make typescript happy
		{ rel: 'stylesheet', href: tailwindStyleSheetUrl },
		{ rel: 'icon', type: 'image/svg+xml', href: '/favicons/logo.svg' },
	].filter(Boolean)
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
	return [
		{ title: data ? 'Hitchcox Aesthetics' : 'Error | Hitchcox Aesthetics' },
		{
			name: 'description',
			content:
				'Sarah Hitchcox Aesthetics offers Botox, dermal fillers, laser treatments, and medical weight loss in Knoxville and Farragut, TN. Book your consultation today.',
		},
		// Open Graph
		{ property: 'og:type', content: 'website' },
		{ property: 'og:site_name', content: 'Sarah Hitchcox Aesthetics' },
		{
			property: 'og:title',
			content: data
				? 'Sarah Hitchcox Aesthetics | Knoxville & Farragut Med Spa'
				: 'Error | Hitchcox Aesthetics',
		},
		{
			property: 'og:description',
			content:
				'Sarah Hitchcox Aesthetics offers Botox, dermal fillers, laser treatments, and medical weight loss in Knoxville and Farragut, TN. Book your consultation today.',
		},
		{
			property: 'og:image',
			content: `${data?.requestInfo.origin ?? 'https://hitchcoxaesthetics.com'}/img/sarah.jpg`,
		},
		{ property: 'og:image:width', content: '1200' },
		{ property: 'og:image:height', content: '630' },
		{
			property: 'og:url',
			content: `${data?.requestInfo.origin ?? 'https://hitchcoxaesthetics.com'}${data?.requestInfo.path ?? '/'}`,
		},
		{ property: 'og:locale', content: 'en_US' },
		// Twitter Card
		{ name: 'twitter:card', content: 'summary_large_image' },
		{
			name: 'twitter:title',
			content: data
				? 'Sarah Hitchcox Aesthetics | Knoxville & Farragut Med Spa'
				: 'Error | Hitchcox Aesthetics',
		},
		{
			name: 'twitter:description',
			content:
				'Sarah Hitchcox Aesthetics offers Botox, dermal fillers, laser treatments, and medical weight loss in Knoxville and Farragut, TN.',
		},
		{
			name: 'twitter:image',
			content: `${data?.requestInfo.origin ?? 'https://hitchcoxaesthetics.com'}/img/sarah.jpg`,
		},
	]
}

export async function loader({ request }: LoaderFunctionArgs) {
	const timings = makeTimings('root loader')
	const userId = await time(() => getUserId(request), {
		timings,
		type: 'getUserId',
		desc: 'getUserId in root',
	})

	const user = userId
		? await time(
				() =>
					prisma.user.findUniqueOrThrow({
						select: {
							id: true,
							name: true,
							type: true,
							image: { select: { id: true } },
							dob: true,
							roles: {
								select: {
									name: true,
									permissions: {
										select: { entity: true, action: true, access: true },
									},
								},
							},
						},
						where: { id: userId },
					}),
				{ timings, type: 'find user', desc: 'find user in root' },
			)
		: null
	if (userId && !user) {
		console.info('something weird happened')
		// something weird happened... The user is authenticated but we can't find
		// them in the database. Maybe they were deleted? Let's log them out.
		await logout({ request, redirectTo: '/' })
	}
	const { toast, headers: toastHeaders } = await getToast(request)
	const honeyProps = honeypot.getInputProps()

	// Compute overlay header detection server-side
	const pathname = new URL(request.url).pathname
	const pathWithoutLeadingSlash = pathname.replace(/^\//, '')
	const staticOverlayPages = new Set(['/', '/knoxville', '/farragut'])
	const locationMatch = pathWithoutLeadingSlash.match(
		/^(knoxville|farragut)-(.+)$/,
	)
	const isLocationServicePage = locationMatch
		? isServicePage(locationMatch[2]!)
		: false
	const isOverlayPage =
		staticOverlayPages.has(pathname) ||
		isServicePage(pathWithoutLeadingSlash) ||
		!!locationServices[pathWithoutLeadingSlash] ||
		isLocationServicePage

	return json(
		{
			user,
			requestInfo: {
				hints: getHints(request),
				origin: getDomainUrl(request),
				path: pathname,
				userPrefs: {
					theme: 'light' as const, // getTheme(request),
				},
			},
			ENV: getEnv(),
			toast,
			honeyProps,
			isOverlayPage,
			menuLinks,
		},
		{
			headers: combineHeaders(
				{ 'Server-Timing': timings.toString() },
				toastHeaders,
			),
		},
	)
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
	const headers = {
		'Server-Timing': loaderHeaders.get('Server-Timing') ?? '',
	}
	return headers
}

const ThemeFormSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']),
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ThemeFormSchema,
	})

	invariantResponse(submission.status === 'success', 'Invalid theme received')

	const { theme } = submission.value

	const responseInit = {
		headers: { 'set-cookie': setTheme(theme) },
	}
	return json({ result: submission.reply() }, responseInit)
}

// add dataLayer to window

function Document({
	children,
	nonce,
	theme = 'light',
	env = {},
}: {
	children: React.ReactNode
	nonce: string
	theme?: Theme
	env?: Record<string, string>
}) {
	const isHydrated = useHydrated()
	const location = useLocation()
	const data = useLoaderData<typeof loader>()
	const origin = data?.requestInfo?.origin ?? 'https://hitchcoxaesthetics.com'
	const canonicalUrl = `${origin}${location.pathname}`

	useEffect(() => {
		if (typeof window === 'undefined' || !isHydrated) {
			return
		}
		addGTM(ENV.GTM_ID!)
	}, [isHydrated])

	const localBusinessJsonLd = {
		'@context': 'https://schema.org',
		'@type': 'MedicalBusiness',
		name: 'Sarah Hitchcox Aesthetics',
		description:
			'Medical spa offering Botox, dermal fillers, laser treatments, microneedling, and medical weight loss in Knoxville and Farragut, TN.',
		url: 'https://hitchcoxaesthetics.com',
		telephone: '(865) 214-7238',
		email: 'sarah@hitchcoxaesthetics.com',
		image: `${origin}/img/sarah.jpg`,
		priceRange: '$$',
		address: [
			{
				'@type': 'PostalAddress',
				streetAddress: '5113 Kingston Pike Suite 15',
				addressLocality: 'Knoxville',
				addressRegion: 'TN',
				postalCode: '37919',
				addressCountry: 'US',
			},
			{
				'@type': 'PostalAddress',
				streetAddress: '102 S Campbell Station Rd Suite 8',
				addressLocality: 'Knoxville',
				addressRegion: 'TN',
				postalCode: '37934',
				addressCountry: 'US',
			},
		],
		geo: {
			'@type': 'GeoCoordinates',
			latitude: 35.9392,
			longitude: -83.9913,
		},
		sameAs: ['https://www.instagram.com/hitchcoxaesthetics/'],
		founder: {
			'@type': 'Person',
			name: 'Sarah Hitchcox',
			jobTitle: 'Registered Nurse, Aesthetic Injector',
		},
		medicalSpecialty: 'Dermatology',
		areaServed: [
			{ '@type': 'City', name: 'Knoxville' },
			{ '@type': 'City', name: 'Farragut' },
		],
	}

	return (
		<html lang="en" className={`${theme} h-full overflow-x-hidden`}>
			<head>
				<ClientHintCheck nonce={nonce} />
				<Meta />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<link rel="canonical" href={canonicalUrl} />
				<Links />
				<script
					nonce={nonce}
					type="application/ld+json"
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(localBusinessJsonLd),
					}}
				/>
			</head>
			<body className="bg-background text-foreground">
				{children}
				<script
					nonce={nonce}
					dangerouslySetInnerHTML={{
						__html: `window.ENV = ${JSON.stringify(env)}`,
					}}
				/>
				<ScrollRestoration nonce={nonce} />
				<Scripts nonce={nonce} />

				<script
					src="https://maps.googleapis.com/maps/api/js?key=AIzaSyDPXmzplyM5tJLCWiMoA2cVRynP9Dg5U3s&libraries=places&loading=async"
					async
					nonce={nonce}
				></script>
			</body>
		</html>
	)
}

function App() {
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const data = useLoaderData<typeof loader>()
	const nonce = useNonce()
	const theme = useTheme()

	useToast(data.toast)

	return (
		<Document nonce={nonce} theme={theme} env={data.ENV}>
			<div
				className={`flex h-screen flex-col justify-between ${isMenuOpen ? 'overflow-hidden' : ''}`}
			>
				<Header isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
				<Outlet context={{ isMenuOpen, setIsMenuOpen }} />
				<Footer />
				<CTA />
			</div>
			<EpicToaster closeButton position="top-center" theme={theme} />
			<EpicProgress />
		</Document>
	)
}

// const noHeaderPages = ['/']
const noHeaderPages: string[] = []

function Header({
	isMenuOpen,
	setIsMenuOpen,
}: {
	isMenuOpen: boolean
	setIsMenuOpen: (isOpen: boolean) => void
}) {
	useEffect(() => {
		const handleEscapeKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && isMenuOpen) {
				setIsMenuOpen(false)
			}
		}

		document.addEventListener('keydown', handleEscapeKey)

		return () => {
			document.removeEventListener('keydown', handleEscapeKey)
		}
	}, [isMenuOpen, setIsMenuOpen])

	const location = useLocation()
	const noHeader = noHeaderPages.includes(location.pathname)
	const links = useLinks()
	useEffect(() => {
		setIsMenuOpen(false)
	}, [location.pathname, setIsMenuOpen])
	const data = useLoaderData<typeof loader>()
	const isOverlayPage = data.isOverlayPage
	const padding = !isOverlayPage
	return (
		<>
			<header
				className={`border-subtle ${padding ? 'sticky' : 'fixed'} top-0 z-40 flex h-[3rem] w-full items-center justify-between bg-black px-4 py-1.5 text-foreground sm:mix-blend-difference ${
					noHeader ? 'hidden' : ''
				}`}
			>
				<div className="flex items-center space-x-2">
					<button
						type="button"
						className={`z-10 flex h-[28px] w-[33px] flex-col justify-between p-[4px]`}
						onClick={() => {
							setIsMenuOpen(!isMenuOpen)
						}}
					>
						<span
							className={`block h-[2px] w-full origin-bottom-left rounded-full bg-white transition-all ease-in-out ${
								isMenuOpen ? 'rotate-45' : ''
							} focus:ring-outline-400`}
						></span>
						<span
							className={`block h-[2px] w-full rounded-full bg-white transition-all ease-in-out ${
								isMenuOpen ? 'scale-y-0' : ''
							}`}
						></span>
						<span
							className={`block h-[2px] w-full origin-top-left rounded-full bg-white transition-all ease-in-out ${
								isMenuOpen ? '-rotate-45 ' : ''
							}`}
						></span>
					</button>
				</div>
				<div className="flex">
					{/* <ThemeSwitch userPreference={data.requestInfo.userPrefs.theme} /> */}
					<Link to="/" className="flex items-center space-x-4">
						<div className="flex flex-col items-center justify-center">
							<p className="mb-[-3px] whitespace-nowrap text-[1.1rem] text-white">
								SARAH HITCHCOX
							</p>
							<p className="text-[0.7rem] text-gray-300 dark:text-gray-300">
								AESTHETICS
							</p>
						</div>
						<Logo className="size-[2rem] text-white" />
					</Link>
				</div>
			</header>
			{
				/*noHeader &&*/ isMenuOpen && (
					<button
						type="button"
						onClick={() => setIsMenuOpen(false)}
						className="animate-fadeIn fixed left-4 top-2 z-[60] flex items-center justify-center rounded-full text-foreground hover:text-foreground"
					>
						<Icon name="x" className="h-8 w-8" />
					</button>
				)
			}
			<nav
				className={`nav-menu fixed overflow-y-scroll ${
					// noHeader ? 'top-0 h-[100vh]' : 'top-[3rem] h-[calc(100dvh-3rem)]'
					'top-0 h-[100vh]'
				} z-[60] flex w-full flex-col items-center justify-center bg-background text-3xl opacity-0 ${
					isMenuOpen
						? 'visible opacity-100 transition-opacity duration-300 ease-in-out'
						: 'pointer-events-none'
				} fixed`}
			>
				<ListWithDot links={links} className="px-3 py-16 text-2xl" />
			</nav>
		</>
	)
}

function _Header() {
	const user = useOptionalUser()
	const matches = useMatches()
	const isOnSearchPage = matches.find(m => m.id === 'routes/users+/index')
	const searchBar = isOnSearchPage ? null : <SearchBar status="idle" />
	return (
		<header className="container py-6">
			<nav className="flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap md:gap-8">
				<Logo className="text-white" />
				<div className="ml-auto hidden max-w-sm flex-1 sm:block">
					{searchBar}
				</div>
				<div className="flex items-center gap-10">
					{user ? (
						<UserDropdown />
					) : (
						<Button asChild variant="default" size="lg">
							<Link to="/auth">Log In</Link>
						</Button>
					)}
				</div>
				<div className="block w-full sm:hidden">{searchBar}</div>
			</nav>
		</header>
	)
}

// instagram https://www.instagram.com/hitchcoxaesthetics/
function Footer() {
	return (
		<div className="container py-12 pb-32">
			<div className="mb-12 border-b pb-8">
				<div className="grid gap-8 md:grid-cols-2">
					{locations.map(location => (
						<div key={location.id} className="space-y-4">
							<Link to={`/${location.id}`}>
								<h3 className="text-xl font-semibold hover:text-primary hover:underline">
									{location.name} Med Spa
								</h3>
							</Link>
							<div className="space-y-2">
								<p className="text-lg">{formatAddress(location)}</p>
								<a
									href={location.googleMapsDirectionsUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 text-primary hover:underline"
								>
									<Icon name="map-pin" className="h-4 w-4" />
									Get Directions
								</a>
							</div>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-col justify-between space-y-8 md:flex-row md:space-y-0">
				<div className="flex flex-col space-y-4">
					<h2 className="text-2xl font-semibold">Contact Our Med Spa</h2>
					<p className="text-lg">(865) 214-7238</p>
					<p className="text-lg">sarah@hitchcoxaesthetics.com</p>
				</div>
				<div className="flex flex-col space-y-4 text-lg">
					<h2 className="text-2xl font-semibold">Connect on Social Media</h2>
					<a
						href="https://www.instagram.com/hitchcoxaesthetics/"
						target="_blank"
						rel="noopener noreferrer"
						className="text-lg hover:text-primary"
					>
						<Icon name="instagram-logo" className="h-6 w-6" />
					</a>
				</div>
				<div className="flex flex-col space-y-4 text-lg">
					<h2 className="text-2xl font-semibold">Policies & Legal</h2>
					<Link to="/tos">Terms of Service</Link>
					<Link to="/privacy">Privacy Policy</Link>
				</div>
			</div>
		</div>
	)
}

// function Logo() {
// 	return (
// 		<Link to="/" className="group grid leading-snug">
// 			<span className="font-light transition group-hover:-translate-x-1">
// 				epic
// 			</span>
// 			<span className="font-bold transition group-hover:translate-x-1">
// 				notes
// 			</span>
// 		</Link>
// 	)
// }

function AppWithProviders() {
	const data = useLoaderData<typeof loader>()
	return (
		<HoneypotProvider {...data.honeyProps}>
			<App />
		</HoneypotProvider>
	)
}

export default withSentry(AppWithProviders)

function UserDropdown() {
	const user = useUser()
	const submit = useSubmit()
	const formRef = useRef<HTMLFormElement>(null)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button asChild variant="secondary">
					<Link
						to={`/users/${user.id}`}
						// this is for progressive enhancement
						onClick={e => e.preventDefault()}
						className="flex items-center gap-2"
					>
						<img
							className="h-8 w-8 rounded-full object-cover"
							alt={user.name ?? user.id}
							src={getUserImgSrc(user.image?.id)}
						/>
						<span className="text-body-sm font-bold">
							{user.name ?? user.id}
						</span>
					</Link>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuPortal>
				<DropdownMenuContent sideOffset={8} align="start">
					<DropdownMenuItem asChild>
						<Link prefetch="intent" to={`/users/${user.id}`}>
							<Icon className="text-body-md" name="avatar">
								Profile
							</Icon>
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link prefetch="intent" to={`/users/${user.id}/notes`}>
							<Icon className="text-body-md" name="pencil-2">
								Notes
							</Icon>
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem
						asChild
						// this prevents the menu from closing before the form submission is completed
						onSelect={event => {
							event.preventDefault()
							submit(formRef.current)
						}}
					>
						<Form action="/logout" method="POST" ref={formRef}>
							<Icon className="text-body-md" name="exit">
								<button type="submit">Logout</button>
							</Icon>
						</Form>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenuPortal>
		</DropdownMenu>
	)
}

/**
 * @returns the user's theme preference, or the client hint theme if the user
 * has not set a preference.
 */
export function useTheme() {
	const hints = useHints()
	const requestInfo = useRequestInfo()
	const optimisticMode = useOptimisticThemeMode()
	if (optimisticMode) {
		return optimisticMode === 'system' ? hints.theme : optimisticMode
	}
	return requestInfo.userPrefs.theme ?? hints.theme
}

/**
 * If the user's changing their theme mode preference, this will return the
 * value it's being changed to.
 */
export function useOptimisticThemeMode() {
	const fetchers = useFetchers()
	const themeFetcher = fetchers.find(f => f.formAction === '/')

	if (themeFetcher && themeFetcher.formData) {
		const submission = parseWithZod(themeFetcher.formData, {
			schema: ThemeFormSchema,
		})

		if (submission.status === 'success') {
			return submission.value.theme
		}
	}
}

function _ThemeSwitch({ userPreference }: { userPreference?: Theme | null }) {
	const fetcher = useFetcher<typeof action>()

	const [form] = useForm({
		id: 'theme-switch',
		lastResult: fetcher.data?.result,
	})

	const optimisticMode = useOptimisticThemeMode()
	const mode = optimisticMode ?? userPreference ?? 'system'
	const nextMode =
		mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'
	const modeLabel = {
		light: (
			<Icon name="sun">
				<span className="sr-only">Light</span>
			</Icon>
		),
		dark: (
			<Icon name="moon">
				<span className="sr-only">Dark</span>
			</Icon>
		),
		system: (
			<Icon name="laptop">
				<span className="sr-only">System</span>
			</Icon>
		),
	}

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<input type="hidden" name="theme" value={nextMode} />
			<div className="flex gap-2">
				<button
					type="submit"
					className="flex h-8 w-8 cursor-pointer items-center justify-center"
				>
					{modeLabel[mode]}
				</button>
			</div>
		</fetcher.Form>
	)
}

function useLinks() {
	const data = useLoaderData<typeof loader>()
	return useMemo(() => {
		return data.menuLinks
	}, [data.menuLinks])
}

export function ErrorBoundary() {
	// the nonce doesn't rely on the loader so we can access that
	const nonce = useNonce()

	// NOTE: you cannot use useLoaderData in an ErrorBoundary because the loader
	// likely failed to run so we have to do the best we can.
	// We could probably do better than this (it's possible the loader did run).
	// This would require a change in Remix.

	// Just make sure your root route never errors out and you'll always be able
	// to give the user a better UX.

	return (
		<Document nonce={nonce}>
			<GeneralErrorBoundary />
		</Document>
	)
}

// hello
