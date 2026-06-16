import { invariant } from '@epic-web/invariant'
import { redirect } from '@remix-run/node'
import { safeRedirect } from 'remix-utils/safe-redirect'

import { type VerifyFunctionArgs } from '#/app/routes/_auth+/verify.server.ts'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { authSessionStorage } from '#app/utils/session.server.js'

export async function handleVerification({
	submission,
	request,
}: VerifyFunctionArgs) {
	invariant(
		submission.status === 'success',
		'Submission should be successful by now',
	)
	const { redirectTo, target, remember } = submission.value
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const user = await prisma.user.findUnique({
		where: { phone: target },
	})
	invariant(user, 'User should be created when verifying phone number')
	const session = await prisma.session.create({
		select: { id: true, expirationDate: true, userId: true },
		data: {
			expirationDate: getSessionExpirationDate(),
			userId: user.id,
		},
	})
	authSession.set(sessionKey, session.id)

	// "Remember me" -> persistent cookie for 7 days. Otherwise a session cookie
	// that clears when the browser closes.
	const REMEMBER_ME_COOKIE_MS = 1000 * 60 * 60 * 24 * 7
	if (!remember) authSession.unset('expires')
	return redirect(safeRedirect(redirectTo ?? '/'), {
		headers: {
			'set-cookie': await authSessionStorage.commitSession(
				authSession,
				remember
					? { expires: new Date(Date.now() + REMEMBER_ME_COOKIE_MS) }
					: {},
			),
		},
	})
}
