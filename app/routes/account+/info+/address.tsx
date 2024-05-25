import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type Address } from '@prisma/client'
import {
	type LoaderFunctionArgs,
	json,
	type ActionFunctionArgs,
	redirect,
} from '@remix-run/node'
import { useActionData, useFetcher, useLoaderData } from '@remix-run/react'
import { useEffect } from 'react'
import { useDebounceFetcher } from 'remix-utils/use-debounce-fetcher'
import { z } from 'zod'

import { ErrorList, Field } from '#app/components/forms.js'
import { Button } from '#app/components/ui/button'
import { Card, CardContent, CardHeader } from '#app/components/ui/card'
import { Input } from '#app/components/ui/input'
import { requireUser, requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { useRedirectTo } from './_layout'

const AddressSchema = z.object({
	intent: z.literal('address'),
	addressLine1: z.string(),
	addressLine2: z.string().optional(),
	apt: z.string().optional(),
	city: z.string(),
	county: z.string().optional(),
	state: z.string(),
	zip: z.string(),
	zip4: z.string().optional(),
	redirectTo: z.string(),
})

const LocationSchema = z.object({
	intent: z.literal('location'),
	id: z.string(),
	name: z.string().optional(),
	formattedAddress: z.string().optional(),
	addressLine1: z.string().optional(),
	addressLine2: z.string().optional(),
	apt: z.string().optional(),
	city: z.string().optional(),
	county: z.string().optional(),
	state: z.string().optional(),
	country: z.string().optional(),
	zip: z.string().optional(),
	zip4: z.string().optional(),
	lat: z.number().optional(),
	lng: z.number().optional(),
	url: z.string().optional(),
	json: z.string().optional(),
})

const ActionSchema = z.discriminatedUnion('intent', [
	LocationSchema,
	AddressSchema,
])

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUser(request)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: ActionSchema,
	})
	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	switch (submission.value.intent) {
		case 'location': {
			const data = submission.value
			await prisma.user.update({
				where: {
					id: user.id,
				},
				data: {
					location: {
						connectOrCreate: {
							where: {
								id: data.id,
							},
							create: {
								...data,
								json: JSON.stringify(data),
							},
						},
					},
				},
			})
			await prisma.address.deleteMany({
				where: {
					userId: user.id,
				},
			})
			return null
		}
		case 'address': {
			const {
				intent: _intent,
				redirectTo: _redirectTo,
				...data
			} = submission.value
			await prisma.address.upsert({
				where: {
					userId: user.id,
				},
				update: {
					user: {
						connect: {
							id: user.id,
						},
					},
					...data,
				},
				create: {
					user: {
						connect: {
							id: user.id,
						},
					},
					...data,
				},
			})
			if (user.locationId) {
				await prisma.googleLocation.update({
					where: {
						id: user.locationId,
					},
					data: {
						users: {
							disconnect: {
								id: user.id,
							},
						},
					},
				})
			}
		}
	}
	return redirect(submission.value.redirectTo)
}

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: {
			id: userId,
		},
		include: {
			location: true,
			address: true,
		},
	})
	return { user }
}

export function parseLocation(place: any) {
	const addressComponents = place.address_components.reduce(
		(acc: any, comp: any) => {
			const type = comp.types[0]
			acc[type] = comp.long_name
			return acc
		},
		{},
	)
	let addressLine1 = ''
	if (addressComponents.street_number) {
		addressLine1 += addressComponents.street_number
	}
	if (addressComponents.route) {
		addressLine1 += addressLine1
			? ` ${addressComponents.route}`
			: addressComponents.route
	}

	return {
		id: place.place_id,
		name: place.name,
		formattedAddress: place.formatted_address ?? '',
		addressLine1,
		addressLine2: addressComponents.subpremise ?? '',
		apt: addressComponents.subpremise ?? '',
		city: addressComponents.locality ?? '',
		county: addressComponents.administrative_area_level_2 ?? '',
		state: addressComponents.administrative_area_level_1 ?? '',
		country: addressComponents.country ?? '',
		zip: addressComponents.postal_code ?? '',
		zip4: addressComponents.postal_code_suffix ?? '',
		lat: place.geometry.location.lat ?? '',
		lng: place.geometry.location.lng ?? '',
		url: place.url ?? '',
	}
}

export function locationToAddress(
	location: ReturnType<typeof parseLocation>,
): Omit<Address, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {
	return {
		addressLine1: location.addressLine1,
		addressLine2: location.addressLine2,
		city: location.city,
		state: location.state,
		county: location.county,
		zip: location.zip,
	}
}

export function AddressForm() {
	const { user } = useLoaderData<typeof loader>()
	const fetcher = useDebounceFetcher()
	const address = user?.address ?? user?.location
	const actionData = useActionData<typeof action>()
	const redirectTo = useRedirectTo()
	const [form, fields] = useForm({
		id: 'address-form',
		constraint: getZodConstraint(AddressSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AddressSchema })
		},
		defaultValue: {
			addressLine1: address?.addressLine1,
			addressLine2: address?.addressLine2,
			city: address?.city,
			state: address?.state,
			county: address?.county,
			zip: address?.zip,
			redirectTo,
		},
	})

	return (
		<div className="mx-auto mt-2 w-full">
			<fetcher.Form
				method="post"
				className="mx-auto flex max-w-lg flex-col gap-2"
				{...getFormProps(form)}
			>
				<input type="hidden" name="intent" value="address" />
				<input
					{...getInputProps(fields.redirectTo, {
						type: 'hidden',
					})}
				/>
				<Field
					labelProps={{
						htmlFor: fields.addressLine1.id,
						children: 'Address Line 1',
					}}
					inputProps={{
						...getInputProps(fields.addressLine1, {
							type: 'text',
						}),
						required: true,
					}}
					errors={fields.addressLine1.errors}
				/>
				<Field
					labelProps={{
						htmlFor: fields.addressLine2.id,
						children: 'Address Line 2',
					}}
					inputProps={getInputProps(fields.addressLine2, { type: 'text' })}
					errors={fields.addressLine2.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.city.id, children: 'City' }}
					inputProps={{
						...getInputProps(fields.city, { type: 'text' }),
						required: true,
					}}
					errors={fields.city.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.state.id, children: 'State' }}
					inputProps={{
						...getInputProps(fields.state, { type: 'text' }),
						required: true,
					}}
					errors={fields.state.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.county.id, children: 'County' }}
					inputProps={getInputProps(fields.county, { type: 'text' })}
					errors={fields.county.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.zip.id, children: 'ZIP Code' }}
					inputProps={{
						...getInputProps(fields.zip, { type: 'text' }),
						required: true,
					}}
					errors={fields.zip.errors}
				/>
				<ErrorList errors={form.errors} />
				<Button className="w-full" variant="secondary" type="submit">
					{redirectTo ? 'Next' : 'Save'}
				</Button>
			</fetcher.Form>
		</div>
	)
}

function Address() {
	const fetcher = useFetcher()
	useEffect(() => {
		// @ts-expect-error
		const autocomplete = new google.maps.places.Autocomplete(
			document.getElementById('autocomplete') as any,
			{ types: ['geocode'], componentRestrictions: { country: 'us' } },
		)

		autocomplete.addListener('place_changed', () => {
			const place = autocomplete.getPlace()
			const location = parseLocation(place)
			const address = locationToAddress(location)
			for (const [key, value] of Object.entries(address)) {
				;(
					document.getElementById('address-form-' + key) as HTMLInputElement
				).value = value ?? ''
			}

			fetcher.submit(
				{ intent: 'location', location: JSON.stringify(place) },
				{ method: 'post' },
			)
		})
	}, [fetcher])
	const actionData = useActionData<typeof action>()
	const locationErrors =
		fetcher.formData?.get('intent') === 'location' && actionData?.result?.error

	return (
		<>
			<Input
				id="autocomplete"
				placeholder="Enter your address"
				className="w-full"
			/>
			{locationErrors &&
				Object.entries(locationErrors).map(([key, value]) => (
					<ErrorList key={key} errors={value} id={key} />
				))}
			<AddressForm />
		</>
	)
}

export default function UserInfo() {
	return (
		<div className="mx-1 flex min-h-full w-full flex-col items-center justify-center">
			<Card className="w-full max-w-xl space-y-2 p-2">
				<CardHeader>
					<h1 className="text-center text-2xl font-bold text-foreground">
						Address
					</h1>
				</CardHeader>
				<CardContent>
					<Address />
				</CardContent>
			</Card>
		</div>
	)
}
