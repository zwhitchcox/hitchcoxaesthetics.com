import { parseWithZod } from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	type createCookieSessionStorage,
	json,
	type LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import { createTypedSessionStorage } from 'remix-utils/typed-session'
import { z, type ZodObject } from 'zod'

import {
	combineSchemas,
	combineSteps,
	getFullSchema,
	type Step,
	type StepSchemasCombine,
	type StepSchemasCombineObj,
	type StepSchemasFull,
} from '#/app/utils/stepper'
import { redirectNextStep } from '#app/routes/book+/_steps+/__step-tracker.server.js'

export function createStepper<T extends Step[] | [Step] | Readonly<Step[]>>({
	steps,
	sessionStorage,
}: {
	steps: T
	sessionStorage: ReturnType<typeof createCookieSessionStorage>
}) {
	type StepName = T[number]['name']
	const fullSchema = getFullSchema(steps) as ZodObject<StepSchemasFull<T>>
	const _steps = combineSteps(steps) as StepSchemasCombine<T>
	const schemas = combineSchemas(steps) as StepSchemasCombineObj<T>
	const singleSchemas = steps.map(step => ({
		name: step.name,
		schema: z.object(step.shape),
	}))
	const typedSessionStorage = createTypedSessionStorage({
		sessionStorage,
		schema: fullSchema.partial(),
	})
	async function getStepData<U extends StepName>(request: Request) {
		const cookie =
			(await typedSessionStorage.getSession(request.headers.get('Cookie'))) ||
			{}
		const url = new URL(request.url)
		const step = url.pathname.split('/').at(-1) as U
		const base = url.pathname.slice(0, url.pathname.lastIndexOf('/'))
		const schema = schemas[step]
		if (!schema) {
			throw new Error('Step not found')
		}
		const submission = schema.safeParse(cookie.data)
		if (submission.success) {
			return submission.data
		}
		const latestStep = await getLatestStep(request)
		throw redirect(`${base}/${latestStep + url.search}`)
	}
	const firstStep = steps[0].name
	async function getLatestStep(
		request: Request,
	): Promise<T[number]['name'] | undefined> {
		const cookie =
			(await typedSessionStorage.getSession(request.headers.get('Cookie'))) ||
			{}
		for (const { name, schema } of singleSchemas) {
			const result = schema.safeParse(cookie.data)
			if (result.success) {
				continue
			}
			return name
		}
		return steps[steps.length - 1].name
	}

	const action = <U extends StepName>(name: U) => {
		if (!steps.some(step => step.name === name)) {
			throw new Error(`Step ${name} not found`)
		}
		const schema = z.object(steps.find(step => step.name === name)!.shape)
		return async ({ request }: Pick<ActionFunctionArgs, 'request'>) => {
			const formData = await request.formData()
			const submission = await parseWithZod(formData, {
				async: true,
				schema,
			})
			if (submission.status !== 'success') {
				return json(
					{ result: submission.reply() },
					{ status: submission.status === 'error' ? 400 : 200 },
				)
			}
			const cookie =
				(await typedSessionStorage.getSession(request.headers.get('Cookie'))) ||
				{}
			for (const [key, value] of Object.entries(submission.value)) {
				cookie.set(key as keyof typeof cookie.data, value)
			}
			return redirectNextStep(steps, request, {
				headers: {
					'Set-Cookie': await typedSessionStorage.commitSession(cookie),
				},
			})
		}
	}

	const loader = <U extends StepName>(name: U) => {
		if (!steps.some(step => step.name === name)) {
			throw new Error(`Step ${name} not found`)
		}
		return ({
			request,
		}: Pick<LoaderFunctionArgs, 'request'>): z.infer<
			StepSchemasCombineObj<T>[U]
		> => {
			return getStepData<U>(request)
		}
	}

	return {
		firstStep: firstStep as T[0]['name'],
		getStepData,
		getLatestStep,
		fullSchema,
		schemas,
		steps: _steps,
		sessionStorage: typedSessionStorage,
		action,
		loader,
	}
}
