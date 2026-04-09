import { invariant } from '@epic-web/invariant'
import { redirect } from '@remix-run/node'
import { type Step } from '#app/utils/stepper.js'

export function redirectNextStep<T extends Readonly<Step[]>>(
	steps: T,
	request: Request,
	init?: ResponseInit,
) {
	const { search, pathname } = new URL(request.url)
	const stepName = pathname.split('/').at(-1)
	const nextStep = steps[steps.findIndex(step => step.name === stepName) + 1]
	invariant(nextStep, 'No next step found')
	return redirect(`/book/${nextStep.name}` + search, init)
}
