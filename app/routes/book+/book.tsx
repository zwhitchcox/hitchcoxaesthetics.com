import { useMemo } from 'react'
import { z } from 'zod'

import { useBookData } from '#/app/routes/book+/_steps+/_layout'
import { combineSteps } from '#app/utils/stepper.js'
import { SEOHandle } from '@nasa-gcn/remix-seo'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const bookSteps = [
	{
		name: 'provider',
		shape: {
			providerId: z.string(),
			appointmentId: z.string().optional(),
		},
	},
	{
		name: 'service',
		shape: { serviceId: z.string() },
	},
	{
		name: 'schedule',
		shape: {
			date: z.string().refine(
				// make sure the string can be converted to a date
				val => !isNaN(Number(new Date(val))),
				{
					message: 'Invalid date',
				},
			),
		},
	},
	{ name: 'confirm', shape: {} },
] as const

export function useStepStatuses() {
	const combinedSteps = useMemo(() => combineSteps(bookSteps), [])
	const data = useBookData()
	return useMemo(() => {
		const result: {
			name: (typeof bookSteps)[number]['name']
			valid: boolean
		}[] = []
		let i = 0
		for (const { name, schema } of combinedSteps) {
			const submission = schema.safeParse(data)
			if (submission.success) {
				result.push({ name, valid: true })
			} else {
				break
			}
			i++
		}
		for (const { name } of combinedSteps.slice(i)) {
			result.push({ name, valid: false })
		}
		return result
	}, [combinedSteps, data])
}
