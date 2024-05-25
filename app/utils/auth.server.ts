import { redirect } from '@remix-run/node'
import { safeRedirect } from 'remix-utils/safe-redirect'

import { prisma } from '#/app/utils/db.server.ts'
import { combineHeaders } from '#/app/utils/misc.tsx'
import { authSessionStorage } from '#/app/utils/session.server.ts'
import { UserType } from './types'

export const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30
export const getSessionExpirationDate = () =>
	new Date(Date.now() + SESSION_EXPIRATION_TIME)

export const sessionKey = 'sessionId'

export async function getUserId(request: Request) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	if (!sessionId) return null
	const session = await prisma.session.findUnique({
		select: { user: { select: { id: true } } },
		where: { id: sessionId, expirationDate: { gt: new Date() } },
	})
	if (!session?.user) {
		throw redirect('/', {
			headers: {
				'set-cookie': await authSessionStorage.destroySession(authSession),
			},
		})
	}
	return session.user.id
}

export async function requestUser(request: Request) {
	const userId = await getUserId(request)
	if (!userId) return null
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, phone: true, name: true, dob: true },
	})
	return user
}

export async function requireFullUser(request: Request) {
	const userId = await requireUserId(request)
	if (typeof userId !== 'string') throw await logout({ request })
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			location: true,
			address: true,
		},
	})
	if (user) return user
	throw await logout({ request })
}

export async function requireUser(request: Request) {
	const userId = await requireUserId(request)
	if (typeof userId !== 'string') throw await logout({ request })
	const user = await prisma.user.findUnique({
		where: { id: userId },
	})
	if (user) return user
	throw await logout({ request })
}

export async function requireProvider(request: Request) {
	const user = await requireUser(request)
	if (user.type === UserType.Provider) return user
	throw new Response('Unauthorized', { status: 401 })
}

export async function requireUserId(
	request: Request,
	{ redirectTo }: { redirectTo?: string | null } = {},
) {
	const userId = await getUserId(request)
	if (!userId) {
		const requestUrl = new URL(request.url)
		redirectTo =
			redirectTo === null
				? null
				: redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`
		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
		const loginRedirect = ['/login', loginParams?.toString()]
			.filter(Boolean)
			.join('?')
		throw redirect(loginRedirect)
	}
	return userId
}

export async function requireAnonymous(request: Request, redirectTo = '/') {
	const userId = await getUserId(request)
	if (userId) {
		throw redirect(redirectTo)
	}
}

export async function logout(
	{
		request,
		redirectTo = '/',
	}: {
		request: Request
		redirectTo?: string
	},
	responseInit?: ResponseInit,
) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	// if this fails, we still need to delete the session from the user's browser
	// and it doesn't do any harm staying in the db anyway.
	if (sessionId) {
		// the .catch is important because that's what triggers the query.
		// learn more about PrismaPromise: https://www.prisma.io/docs/orm/reference/prisma-client-reference#prismapromise-behavior
		void prisma.session.deleteMany({ where: { id: sessionId } }).catch(() => {})
	}
	throw redirect(safeRedirect(redirectTo), {
		...responseInit,
		headers: combineHeaders(
			{ 'set-cookie': await authSessionStorage.destroySession(authSession) },
			responseInit?.headers,
		),
	})
}
