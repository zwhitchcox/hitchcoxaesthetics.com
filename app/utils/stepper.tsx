import { invariant } from '@epic-web/invariant'
import { useMemo } from 'react'
import {
	type AnyZodObject,
	z,
	type ZodObject,
	type ZodRawShape,
	type ZodTypeAny,
} from 'zod'

type identity<T> = T
type flatten<T> = identity<{ [k in keyof T]: T[k] }>

export type Step = {
	shape: ZodRawShape
	name: string
}

type StepSchema = {
	schema: AnyZodObject
	name: string
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] }

export type StepSchemasFull<T extends Readonly<Step[]>> =
	T extends Readonly<[infer A extends Step, ...infer B extends Step[]]>
		? flatten<A['shape'] & StepSchemasFull<B>>
		: {}

export type StepSchemasCombine<
	T extends Readonly<Step[]>,
	SoFar extends ZodRawShape = {},
> =
	T extends Readonly<[infer A extends Step, ...infer B extends Step[]]>
		? [
				{
					name: A['name']
					schema: ZodObject<ZodPartial<flatten<A['shape']> & SoFar>>
				},
				...StepSchemasCombine<B, SoFar & A['shape']>,
			]
		: []

export type StepSchemasCombineObj<
	T extends Readonly<Step[]> | [Step] | Step[],
	SoFar extends ZodRawShape = {},
> =
	T extends Readonly<[infer A extends Step]>
		? Record<A['name'], ZodObject<flatten<A['shape'] & SoFar>>>
		: T extends Readonly<[infer A extends Step, ...infer B extends Step[]]>
			? Record<
					A['name'],
					ZodObject<Writeable<flatten<ZodPartial<A['shape']> & SoFar>>>
				> &
					StepSchemasCombineObj<B, SoFar & A['shape']>
			: never
type ZodPartial<T extends Record<string, ZodTypeAny>> = {
	[k in keyof T]: z.ZodOptional<T[k]>
}

export function combineSteps<T extends Readonly<Step[]> | [Step] | Step[]>(
	arr: T,
): StepSchemasCombine<T> {
	const arrStep = arr as Step[]
	return arrStep
		.reduce<Step[]>((acc, step) => {
			const last = acc.at(-1)
			acc.push({
				name: step.name,
				shape: { ...last?.shape, ...step.shape },
			})
			return acc
		}, [])
		.map<StepSchema>((step, i) => {
			return {
				...step,
				schema: z
					.object(step.shape)
					.merge(z.object(arrStep[i].shape).partial()),
			}
		}) as any
}

export function combineSchemas<T extends Readonly<Step[]> | [Step] | Step[]>(
	arr: T,
): flatten<StepSchemasCombineObj<T>> {
	return combineSteps(arr).reduce((acc: any, step: StepSchema) => {
		acc[step.name] = step.schema
		return acc
	}, {})
}

export function getFullSchema<U extends Readonly<Step[]> | [Step] | Step[]>(
	steps: U,
): ZodObject<StepSchemasFull<U>> {
	return combineSteps(steps).at(-1)!.schema as any
}

export function getCurrentStep<T extends Readonly<Step[]> | [Step] | Step[]>(
	steps: T,
	data: any,
): T[number]['name'] {
	invariant(steps.length, 'steps must have at least one step')
	const combined = combineSteps(steps)
	for (const step of combined) {
		const result = step.schema.safeParse(data)
		if (result.success) {
			continue
		}
		return step.name
	}
	return steps.at(-1)!.name
}

export function useStepStatuses<T extends Step[]>(steps: T, data: any) {
	const singleSchemas = useMemo(
		() =>
			steps.map(step => ({
				name: step.name,
				schema: z.object(step.shape),
			})),
		[steps],
	) as StepSchema[]
	return useMemo(() => {
		const result: {
			name: T[number]['name']
			complete: boolean
		}[] = []
		for (const { name, schema } of singleSchemas) {
			const submission = schema.safeParse(data)
			if (submission.success) {
				result.push({ name, complete: true })
			} else {
				result.push({ name, complete: false })
			}
		}
		return result
	}, [singleSchemas, data])
}

// type StepDataParsed<
// 	U extends Readonly<Step[]>,
// 	SoFar extends ZodRawShape = {},
// > =
// 	U extends Readonly<[infer A extends Step, ...infer B extends Step[]]>
// 		?
// 				| {
// 						name: A['name']
// 						data: z.infer<ZodObject<ToPartial<flatten<A['shape']>> & SoFar>>
// 				  }
// 				| StepDataParsed<B, SoFar & A['shape']>
// 		: { name: 'complete'; data: z.infer<ZodObject<flatten<SoFar>>> }
// }
