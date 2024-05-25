import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	json,
	redirect,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { useActionData, useLoaderData } from '@remix-run/react'
import { useDebounceFetcher } from 'remix-utils/use-debounce-fetcher'
import { z } from 'zod'

import { ErrorList, Field } from '#app/components/forms'
import { Card, CardContent, CardHeader } from '#app/components/ui/card'
import { StatusButton } from '#app/components/ui/status-button.js'
import { requireFullUser, requireUser } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { useIsPending } from '#app/utils/misc.js'
import { getAge } from '#app/utils/user.js'
import { useRedirectTo } from './_layout'

export const UserInfoSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	dob: z
		.string()
		.min(1, 'Birthday is required')
		.refine(dob => getAge(new Date(dob)) >= 18, {
			message: 'All clients must be 18 years or older.',
		}),
	redirectTo: z.string(),
})

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireFullUser(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: UserInfoSchema.transform(data => {
			return {
				...data,
				birthday: new Date(data.dob),
			}
		}),
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { name, birthday, redirectTo } = submission.value

	await prisma.user.update({
		where: { id: user.id },
		data: {
			name: name,
			dob: birthday,
		},
	})
	return redirect(redirectTo)
}

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUser(request)
	return json({ user })
}

export default function General() {
	const { user } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const dob = user.dob ? new Date(user.dob) : undefined
	const dobString = dob
		? `${dob.getFullYear()}-${dob.getMonth() + 1}-${dob.getDate()}`
		: ''
	const redirectTo = useRedirectTo()

	const [form, fields] = useForm({
		id: 'general-info',
		constraint: getZodConstraint(UserInfoSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: UserInfoSchema })
		},
		defaultValue: {
			dob: dobString,
			name: user.name,
			redirectTo,
		},
		shouldRevalidate: 'onBlur',
	})
	const fetcher = useDebounceFetcher<typeof action>()
	return (
		<div className="mx-1 flex min-h-full w-full flex-col items-center justify-center">
			<Card className="w-full max-w-xl space-y-2 p-2">
				<CardHeader>
					<h1 className="text-center text-2xl font-bold">General Info</h1>
				</CardHeader>
				<CardContent>
					<fetcher.Form
						method="post"
						className="w-full space-y-4"
						{...getFormProps(form)}
					>
						<Field
							labelProps={{ children: 'Name' }}
							inputProps={{
								autoFocus: true,
								...getInputProps(fields.name, { type: 'text' }),
							}}
							errors={fields.name.errors}
						/>
						<Field
							labelProps={{ children: 'Birthday' }}
							inputProps={{
								...getInputProps(fields.dob, { type: 'date' }),
							}}
							errors={fields.dob.errors}
						/>
						<input
							{...getInputProps(fields.redirectTo, {
								type: 'hidden',
							})}
						/>
						<ErrorList errors={form.errors} id={form.errorId} />
						<StatusButton
							status={isPending ? 'pending' : form.status ?? 'idle'}
							type="submit"
							disabled={isPending}
							variant="secondary"
							className="my-2 mt-4 w-full"
						>
							{redirectTo ? 'Next' : 'Save'}
						</StatusButton>
					</fetcher.Form>
				</CardContent>
			</Card>
		</div>
	)
}
