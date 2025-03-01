import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import InputMask from '@mona-health/react-input-mask'
import {
	type ActionFunctionArgs,
	json,
	type MetaFunction,
	redirect,
} from '@remix-run/node'
import { Form, useActionData, useSearchParams } from '@remix-run/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'

import { prepareVerification } from '#/app/routes/_auth+/verify.server.ts'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { Input } from '#app/components/ui/input.js'
import { Label } from '#app/components/ui/label.js'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { sendSMS } from '#app/utils/sms.server.js'
import { PhoneSchema } from '#app/utils/user-validation.js'

const AuthSchema = z.object({
	phone: PhoneSchema,
	redirectTo: z.string().optional(),
})

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	checkHoneypot(formData)

	const submission = await parseWithZod(formData, {
		schema: AuthSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { phone, redirectTo } = submission.value
	await prisma.user.upsert({
		where: {
			phone: phone,
		},
		create: {
			phone: phone,
		},
		update: {},
		select: {
			id: true,
		},
	})
	let { otp, redirectTo: verifyRedirectTo } = await prepareVerification({
		period: 10 * 60,
		request,
		type: 'login',
		target: phone,
	})
	if (redirectTo) {
		verifyRedirectTo.searchParams.set('redirectTo', redirectTo)
	}

	const response = await sendSMS({
		to: phone,
		body: `Your verification code is ${otp}`,
	})

	if (response.status === 'success') {
		return redirect(verifyRedirectTo.pathname + verifyRedirectTo.search)
	} else {
		return json(
			{
				result: submission.reply({ formErrors: [response.error!] }),
			},
			{
				status: 500,
			},
		)
	}
}

export const meta: MetaFunction = () => {
	return [{ title: 'Log In | Hitchcox Aesthetics' }]
}

export default function AuthRoute() {
	console.log('load')
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const [form, fields] = useForm({
		id: 'auth-form',
		constraint: getZodConstraint(AuthSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AuthSchema })
		},
		shouldRevalidate: 'onBlur',
		defaultValue: {
			phone: ENV.MODE === 'development' ? '+1 (555) 555-5555' : '',
		},
	})

	return (
		<div className="container flex flex-col justify-center pb-32 pt-20">
			<div className="text-center">
				<h1 className="text-h2">Welcome!</h1>
				<p className="mt-2 text-body-md text-muted-foreground">
					Please verify your phone number.
				</p>
			</div>
			<div className="mx-auto mt-4 min-w-full max-w-sm sm:min-w-[368px]">
				<Form method="POST" {...getFormProps(form)}>
					<HoneypotInputs />
					{redirectTo ? (
						<input type="hidden" name="redirectTo" value={redirectTo} />
					) : null}
					<Label htmlFor={fields.phone.id}>Phone Number</Label>
					<InputMask mask="+1 (999) 999-9999" alwaysShowMask={true}>
						<Input
							key="phone"
							id="phone"
							required
							type="tel"
							name="phone"
							autoComplete="tel"
							aria-invalid={Boolean(fields.phone?.errors?.length)}
							aria-describedby={`${fields.phone.id}-error`}
							className="lineheight-.5 w-full  rounded px-2 py-1 text-center text-2xl tracking-widest focus-visible:ring-0"
							defaultValue={fields.phone.value}
						/>
					</InputMask>
					<ErrorList
						errors={fields.phone.errors}
						id={`${fields.phone.id}-error`}
					/>
					<StatusButton
						className="mt-6 w-full"
						status={isPending ? 'pending' : form.status ?? 'idle'}
						type="submit"
						disabled={isPending}
					>
						Send Verification Code
					</StatusButton>
				</Form>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
