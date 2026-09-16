import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	isRouteErrorResponse,
	Link,
	Outlet,
	useLocation,
	useRouteError,
} from '@remix-run/react'
import { useSyncExternalStore } from 'react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { ensurePrimary } from '#app/utils/litefs.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

/**
 * Sarah's article review on her phone (/review). One narrow column, its own
 * small header, no admin nav. Every child route is admin only. The layout
 * stamps ReviewSetting.lastOpenAt (the daily digest reads it) at most once a
 * minute, and offers the "add to home screen" card once.
 */
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

/** How often lastOpenAt is written while she keeps the page open. */
const OPEN_STAMP_MS = 60 * 1000

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const now = new Date()
	const setting = await prisma.reviewSetting.findUnique({
		where: { userId },
		select: { lastOpenAt: true },
	})
	const stale =
		!setting?.lastOpenAt ||
		now.getTime() - setting.lastOpenAt.getTime() > OPEN_STAMP_MS
	if (stale) {
		// a write from a loader: make sure it lands on the LiteFS primary
		await ensurePrimary()
		await prisma.reviewSetting.upsert({
			where: { userId },
			create: { userId, lastOpenAt: now },
			update: { lastOpenAt: now },
		})
	}
	return json({ ok: true })
}

/* ------------------------------------------------------------------------ */
/* S0: add to home screen                                                   */
/* ------------------------------------------------------------------------ */

type HintPlatform = 'ios' | 'android'

const HINT_KEY = 'review:home-screen-done'
const HINT_EVENT = 'review:home-screen-change'

function subscribeHint(callback: () => void) {
	window.addEventListener(HINT_EVENT, callback)
	return () => window.removeEventListener(HINT_EVENT, callback)
}

/** Which platform's steps to show, or null (standalone, dismissed, or a desktop). */
function readHint(): HintPlatform | null {
	if (typeof window === 'undefined') return null
	const nav = window.navigator as Navigator & { standalone?: boolean }
	if (window.matchMedia('(display-mode: standalone)').matches) return null
	if (nav.standalone) return null
	try {
		if (window.localStorage.getItem(HINT_KEY) === '1') return null
	} catch {
		// storage blocked: the card shows again next time, which is fine
	}
	const ua = nav.userAgent
	if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
	if (/Android/.test(ua)) return 'android'
	return null
}

function dismissHint() {
	try {
		window.localStorage.setItem(HINT_KEY, '1')
	} catch {
		// nothing to do
	}
	window.dispatchEvent(new Event(HINT_EVENT))
}

function useHomeScreenHint(): HintPlatform | null {
	return useSyncExternalStore(subscribeHint, readHint, () => null)
}

function HomeScreenCard({ platform }: { platform: HintPlatform }) {
	return (
		<div className="mb-4 rounded-lg border bg-card p-3 text-sm shadow-sm">
			<p className="font-medium">
				Put this on your home screen. Then it opens in one tap.
			</p>
			<ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
				{platform === 'ios' ? (
					<>
						<li>
							Tap Share (the square with the arrow) at the bottom of Safari.
						</li>
						<li>Tap Add to Home Screen.</li>
					</>
				) : (
					<>
						<li>Tap the menu (three dots) at the top of Chrome.</li>
						<li>Tap Add to Home screen.</li>
					</>
				)}
			</ol>
			<button
				type="button"
				onClick={dismissHint}
				className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
			>
				Done
			</button>
		</div>
	)
}

/* ------------------------------------------------------------------------ */
/* Shell                                                                    */
/* ------------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 pt-[env(safe-area-inset-top)]">
			<header className="flex items-center justify-between py-3">
				<Link to="/review" className="text-base font-semibold">
					Article review
				</Link>
				<Link
					to="/review/all"
					className="text-sm text-primary underline-offset-2 hover:underline"
				>
					See all
				</Link>
			</header>
			<main className="flex flex-1 flex-col pb-8">{children}</main>
		</div>
	)
}

export default function ReviewLayout() {
	const { pathname } = useLocation()
	const hint = useHomeScreenHint()
	return (
		<Shell>
			{pathname === '/review' && hint ? (
				<HomeScreenCard platform={hint} />
			) : null}
			<Outlet />
		</Shell>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()
	if (isRouteErrorResponse(error) && error.status === 403) {
		return (
			<Shell>
				<p className="text-sm text-muted-foreground">
					This page is for the practice’s article reviewers. Ask Zane for
					access.
				</p>
			</Shell>
		)
	}
	if (isRouteErrorResponse(error) && error.status === 404) {
		return (
			<Shell>
				<p className="text-sm text-muted-foreground">
					That article is not here any more.
				</p>
				<Link
					to="/review"
					className="mt-3 text-sm font-medium text-primary underline-offset-2 hover:underline"
				>
					Back to the next one
				</Link>
			</Shell>
		)
	}
	return <GeneralErrorBoundary />
}
