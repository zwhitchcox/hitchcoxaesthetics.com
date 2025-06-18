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
import { ListWithDot, type MenuLink } from '#/app/components/list-with-dot'
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
			content: `Med Spa in the Knoxville and Farragut area`,
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

	return json(
		{
			user,
			requestInfo: {
				hints: getHints(request),
				origin: getDomainUrl(request),
				path: new URL(request.url).pathname,
				userPrefs: {
					theme: 'light' as const, // getTheme(request),
				},
			},
			ENV: getEnv(),
			toast,
			honeyProps,
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
	useEffect(() => {
		if (typeof window === 'undefined' || !isHydrated) {
			return
		}
		addGTM(ENV.GTM_ID!)
	}, [isHydrated])

	return (
		<html lang="en" className={`${theme} h-full overflow-x-hidden`}>
			<head>
				<ClientHintCheck nonce={nonce} />
				<Meta />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<Links />
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
	// const data = useLoaderData<typeof loader>()
	const padding =
		!['/'].includes(location.pathname) &&
		!location.pathname.startsWith('/services')
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
		<div className="container flex flex-col justify-between space-y-8 py-12 pb-32 md:flex-row md:space-y-0">
			<div className="flex flex-col space-y-4">
				<h2 className="text-2xl font-semibold">Contact Us</h2>
				<p className="text-lg">
					5113 Kingston Pike, Suite 15, Knoxville, TN 37919
				</p>
				<p className="text-lg">(865) 214-7238</p>
				<p className="text-lg">sarah@hitchcoxaesthetics.com</p>
			</div>
			<div className="flex flex-col space-y-4 text-lg">
				<h2 className="text-2xl font-semibold">Follow Us</h2>
				<a
					href="https://www.instagram.com/hitchcoxaesthetics/"
					target="_blank"
					rel="noopener noreferrer"
					className="text-lg hover:text-primary"
				>
					<Icon name="instagram-logo" className="h-6 w-6" />
				</a>
			</div>
			<div className="flex flex-col space-y-4">
				<h2 className="text-2xl font-semibold">Find Us</h2>
				<div className="h-64 w-full">
					<iframe
						src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3230.3167435990786!2d-83.99134392401903!3d35.93922081575848!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x885c3daeef676e4f%3A0x36d0dab4a91039cb!2sSarah%20Hitchcox%20Aesthetics!5e0!3m2!1sen!2sus!4v1718065436259!5m2!1sen!2sus"
						width="100%"
						height="100%"
						title="Google Maps | Sarah Hitchcox Aesthetics"
						style={{ border: 0 }}
						allowFullScreen={false}
						loading="lazy"
					></iframe>
				</div>
			</div>
			<div className="flex flex-col space-y-4 text-lg">
				<h2 className="text-2xl font-semibold">Legal</h2>
				<Link to="/tos">Terms of Service</Link>
				<Link to="/privacy">Privacy Policy</Link>
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
	return useMemo(() => {
		const links: MenuLink[] = [
			{
				to: '/',
				label: 'Home',
			},
			{
				to: '/about',
				label: 'About',
				hint: 'learn more about Sarah Hitchcox',
			},
			// {
			// 	label: 'Injectables & Skin Treatments',
			// 	hint: 'botox, filler, microneedling, skinvive',
			// 	subLinks: [
			{
				to: '/services/semaglutide',
				label: 'Weight Loss',
				hint: 'semaglutide (ozempic) and tirzepatide injections',
			},
			{
				to: '/services/botox',
				label: 'Botox',
				hint: 'reduce wrinkles and fine lines',
			},
			{
				to: '/services/filler',
				label: 'Filler',
				hint: 'restore youthful contours',
			},
			{
				to: '/services/skinvive',
				label: 'SkinVive',
				hint: 'improve skin texture and glow',
			},
			{
				to: '/services/kybella',
				label: 'Kybella',
				hint: 'reduce submental fat',
			},
			{
				to: '/services/microneedling',
				label: 'Microneedling',
				hint: 'improve acne scars and skin texture',
			},
			// 	],
			// },
			{
				label: 'Laser Services',
				hint: 'brown spots, redness, hair removal, skin rejuvenation',
				subLinks: [
					{
						to: '/services/skin-revitalization',
						label: 'Skin Revitalization',
						hint: 'address fine lines, wrinkles, and pores',
					},
					{
						to: '/services/pigmented-lesion-reduction',
						label: 'Pigmentation Correction',
						hint: 'reduce sun spots, age spots, and freckles',
					},
					{
						to: '/services/vascular-lesion-reduction',
						label: 'Vein & Redness Treatment',
						hint: 'minimize spider veins and redness',
					},
					{
						to: '/services/laser-hair-removal',
						label: 'Laser Hair Removal',
						hint: 'long-lasting hair reduction for all skin types',
					},
				],
			},
			{
				to: '/services/hair-loss-prevention-regrowth',
				label: 'Hair Restoration',
				hint: 'solutions for thinning hair and receding hairlines',
			},
			{
				to: 'https://hitchcoxaesthetics.janeapp.com/#/staff_member/1',
				label: 'Pricing/Book Online',
				hint: 'schedule your personalized treatment plan',
			},
			{
				to: '/location',
				label: 'Find Us',
				hint: 'find our location',
			},
			{
				label: 'Links',
				subLinks: [
					{
						to: 'https://hitchcoxaesthetics.brilliantconnections.com/',
						label: 'SkinMedica Shop',
						hint: 'medical grade skincare products',
					},
					{
						to: 'https://alle.com/',
						label: 'Alle Rewards',
						hint: 'earn rewards on treatments',
					},
				],
			},
		]

		return links
	}, [])
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
