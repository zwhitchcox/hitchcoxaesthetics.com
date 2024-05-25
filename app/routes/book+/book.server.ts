import { createCookieSessionStorage } from '@remix-run/node'

import { bookSteps } from '#/app/routes/book+/book'
import { createStepper } from '#app/utils/stepper.server'

export const sessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'en_book',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10,
		secrets: process.env.SESSION_SECRET.split(','),
		secure: process.env.NODE_ENV === 'production',
	},
})

export const bookStepper = createStepper({ steps: bookSteps, sessionStorage })
