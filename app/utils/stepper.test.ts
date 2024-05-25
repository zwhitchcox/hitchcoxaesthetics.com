import { createCookieSessionStorage } from '@remix-run/node'
import { expect, test } from 'vitest'
import { z } from 'zod'

import {
	combineSchemas,
	combineSteps,
	getFullSchema,
} from '#/app/utils/stepper'
import { createStepper } from '#/app/utils/stepper.server'

const steps = [
	{ name: 'step1', shape: { hello: z.string() } },
	{ name: 'step2', shape: { world: z.string() } },
	{ name: 'step3', shape: { foo: z.string() } },
	{ name: 'step4', shape: { bar: z.string() } },
] as const

test('combineSteps', () => {
	const combinedSteps = combineSteps(steps)
	const data = {
		hello: 'hello',
		world: 'world',
	}
	const result = combinedSteps[1].schema.safeParse(data)
	expect(result).toMatchObject({
		success: true,
		data,
	})
})

test('combineSchemas', () => {
	const combinedSchemas = combineSchemas(steps)
	const data = {
		hello: 'hello',
		world: 'world',
		foo: 'foo',
	}
	expect(
		combinedSchemas.step3.safeParse({ ...data, extra: 'thing' }),
	).toMatchObject({
		success: true,
		data,
	})
})

test('getFullSchema', () => {
	const fullSchema = getFullSchema(steps)
	expect(fullSchema.keyof()._def.values).toEqual([
		'hello',
		'world',
		'foo',
		'bar',
	])
})

test('stepper', async () => {
	const sessionStorage = createCookieSessionStorage({
		cookie: {
			name: '__session',
			domain: 'remix.run',
			httpOnly: true,
			maxAge: 60,
			path: '/',
			sameSite: 'lax',
			secrets: ['s3cret1'],
			secure: true,
		},
	})
	const session = await sessionStorage.getSession()
	session.set('hello', 'world')
	const headers = new Headers()
	headers.set('Cookie', await sessionStorage.commitSession(session))
	const request = new Request('https://remix.run', { headers })
	const stepper = createStepper({ steps, sessionStorage })
	expect(await stepper.getLatestStep(request)).toBe('step2')
})
