import {
	getFormProps,
	getInputProps,
	getTextareaProps,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type ActionFunctionArgs, json, redirect } from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import { z } from 'zod'

import { Field, TextareaField } from '#app/components/forms'
import { Card } from '#app/components/ui/card'
import { StatusButton } from '#app/components/ui/status-button.js'
import { prisma } from '#app/utils/db.server.js'
import { useIsPending } from '#app/utils/misc.js'

export const ServiceSchema = z.object({
	title: z.string().min(1, 'Title is required'),
	body: z.string().min(1, 'Body is required'),
	duration: z
		.string()
		.min(1, 'Duration is required')
		.transform(str => parseInt(str, 10))
		.refine(
			num => !isNaN(num) && num > 0,
			'Duration must be a positive number',
		),
	shortCode: z.string().min(1, 'Short code is required'),
	hint: z.string().min(1, 'Hint is required'),
	slug: z.string().min(1, 'Slug is required'),
	order: z.number().min(0, 'Order is required'),
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ServiceSchema,
	})
	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}
	const newService = await prisma.service.create({
		data: submission.value,
	})
	return redirect(`/admin/services/${newService.id}`)
}

export default function NewService() {
	const actionData = useActionData<typeof action>()
	const [form, fields] = useForm({
		id: 'service-editor',
		constraint: getZodConstraint(ServiceSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ServiceSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const isPending = useIsPending()

	return (
		<Card className="w-full max-w-md p-4">
			<Form
				method="post"
				className="flex flex-col gap-2"
				{...getFormProps(form)}
			>
				<h2 className="mb-4 text-xl font-semibold text-gray-800">
					Create New Service
				</h2>
				<Field
					labelProps={{ children: 'Title' }}
					inputProps={{
						autoFocus: true,
						...getInputProps(fields.title, { type: 'text' }),
					}}
					errors={fields.title.errors}
				/>
				<Field
					labelProps={{ children: 'Short Code' }}
					inputProps={getInputProps(fields.shortCode, { type: 'text' })}
					errors={fields.shortCode.errors}
				/>
				<Field
					labelProps={{ children: 'Hint' }}
					inputProps={getInputProps(fields.hint, { type: 'text' })}
					errors={fields.hint.errors}
				/>
				<TextareaField
					labelProps={{ children: 'Body' }}
					textareaProps={getTextareaProps(fields.body)}
					errors={fields.body.errors}
				/>
				<Field
					labelProps={{ children: 'Duration' }}
					inputProps={getInputProps(fields.duration, { type: 'number' })}
					errors={fields.duration.errors}
				/>

				<div>
					<StatusButton
						className="w-full"
						status={isPending ? 'pending' : form.status ?? 'idle'}
						type="submit"
						disabled={isPending}
					>
						Create Service
					</StatusButton>
				</div>
			</Form>
		</Card>
	)
}
