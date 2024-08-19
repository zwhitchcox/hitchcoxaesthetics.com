import {
	type FieldMetadata,
	getTextareaProps,
	useForm,
	getFormProps,
	getInputProps,
	getCollectionProps,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
	type SerializeFrom,
	redirect,
} from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useLocation,
} from '@remix-run/react'
import { useMemo } from 'react'

import { z } from 'zod'
import { ErrorList, TextareaField } from '#app/components/forms'
import { Card, CardContent, CardHeader } from '#app/components/ui/card'
import { Checkbox } from '#app/components/ui/checkbox'
import { Label } from '#app/components/ui/label'
import { RadioGroup, RadioGroupItem } from '#app/components/ui/radio-group'
import { StatusButton } from '#app/components/ui/status-button.js'
import { requireUser, requireUserId } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { useIsPending } from '#app/utils/misc.js'
import { useRedirectTo } from './_layout'
import { FieldType } from './info'

type SerializedField = SerializeFrom<typeof loader>['form']['fields'][number]
const TextSchema = z.string()
const MultiSelectSchema = z.array(z.string())
type TextInput = z.infer<typeof TextSchema>
type MultiSelectInput = z.infer<typeof MultiSelectSchema>
const YesNoSchema = z.enum(['Yes', 'No'])
type YesNoInput = z.infer<typeof YesNoSchema>
const YesNoNASchema = z.enum(['Yes', 'No', 'N/A'])
type YesNoNAInput = z.infer<typeof YesNoNASchema>
const yesNoSuffix = '$$$__yesno__$$$'
function fieldsToSchema(
	fields: Pick<SerializedField, 'slug' | 'type' | 'required' | 'prompt'>[],
) {
	return z.object(
		fields.reduce(
			(acc, field) => {
				switch (field.type) {
					case FieldType.Text: {
						acc[field.slug] = z.string()
						if (!field.required) {
							acc[field.slug] = acc[field.slug].optional()
						}
						break
					}
					case FieldType.YesNoDetails: {
						acc[field.slug] = z.string()
						const yesNoField = `${field.slug}-${yesNoSuffix}`
						acc[yesNoField] = YesNoSchema
						if (!field.required) {
							acc[yesNoField] = acc[yesNoField].optional()
						}
						break
					}
					case FieldType.YesNoNA: {
						acc[field.slug] = YesNoNASchema
						if (!field.required) {
							acc[field.slug] = acc[field.slug].optional()
						}
						break
					}
					case FieldType.MultiSelect: {
						acc[field.slug] = z.array(z.string())
						if (field.required) {
							acc[field.slug] = (acc[field.slug] as z.ZodArray<any>).min(1, {
								message: 'Please select at least one option',
							})
						}
						break
					}
					default: {
						throw new Error(
							`Couldn't create zod schema for ${field.slug} (${field.type})`,
						)
					}
				}
				acc[field.slug] = acc[field.slug].optional()
				return acc
			},
			{ redirectTo: z.string() } as Record<string, z.ZodTypeAny>,
		),
	) as z.ZodObject<any>
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUser(request)
	const { slug } = params
	const formData = await request.formData()
	const form = await prisma.clientHistoryForm.findUnique({
		where: { slug },
		include: { fields: true },
	})
	invariant(form, 'category not found')
	const schema = fieldsToSchema(form.fields)
	const submission = parseWithZod(formData, {
		schema,
	})
	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}
	for (let [key, value] of Object.entries(submission.value)) {
		if (key.endsWith(yesNoSuffix)) {
			continue
		}
		if (value == null) {
			value = ''
		}
		if (key === 'redirectTo') continue
		const field = form.fields.find(field => field.slug === key)
		invariant(field, `Field not found for key ${key}`)
		switch (field.type as FieldType) {
			case FieldType.Text:
			case FieldType.YesNoNA: {
				const data = {
					answer: value,
					fieldId: field.id,
					userId: user.id,
				}
				await prisma.clientHistoryRecord.upsert({
					where: {
						userId_fieldId: {
							userId: user.id,
							fieldId: field.id,
						},
					},
					create: data,
					update: data,
				})
				break
			}
			case FieldType.YesNoDetails: {
				const yesNoField = `${field.slug}-${yesNoSuffix}`
				const yesNoValue = submission.value[yesNoField]
				const answer = yesNoValue === YesNoSchema.enum.No ? '' : value
				await prisma.clientHistoryRecord.upsert({
					where: {
						userId_fieldId: {
							userId: user.id,
							fieldId: field.id,
						},
					},
					create: {
						fieldId: field.id,
						userId: user.id,
						answer,
					},
					update: {
						answer,
					},
				})
				break
			}
			case FieldType.MultiSelect: {
				await prisma.clientHistoryRecord.upsert({
					where: {
						userId_fieldId: {
							userId: user.id,
							fieldId: field.id,
						},
					},
					create: {
						fieldId: field.id,
						userId: user.id,
						selected: {
							connect: value.map((answer: string) => ({ id: answer })),
						},
					},
					update: {
						selected: {
							set: [],
							connect: value.map((answer: string) => ({
								id: answer,
							})),
						},
					},
				})
				break
			}
			default: {
				throw new Error(`Invalid field type: ${field.type}`)
			}
		}
	}

	return redirect(submission.value.redirectTo)
}

export async function loader({ params, request }: LoaderFunctionArgs) {
	const id = await requireUserId(request)
	const { slug } = params
	const form = await prisma.clientHistoryForm.findUnique({
		where: { slug },
		include: {
			fields: {
				orderBy: { order: 'asc' },
				include: {
					options: { orderBy: { order: 'asc' } },
					records: {
						where: {
							userId: id,
						},
						include: {
							selected: {
								orderBy: { order: 'asc' },
							},
						},
					},
				},
			},
		},
	})
	if (!form) throw new Response('Not Found', { status: 404 })
	const formsWithResponse = {
		...form,
		fields: form.fields.map(field => {
			const record = field.records.find(Boolean)
			return {
				...field,
				record,
			}
		}),
	}
	return json({ form: formsWithResponse })
}

function TextField({ meta }: { meta: FieldMetadata<TextInput> }) {
	const field = useField(meta.name)
	return (
		<div>
			<TextareaField
				textareaProps={getTextareaProps(meta)}
				labelProps={{ children: field.prompt, className: 'font-medium' }}
				errors={meta.errors}
			/>
		</div>
	)
}

function YesNoDetailsField({
	meta,
	metaYesNo,
}: {
	meta: FieldMetadata<TextInput>
	metaYesNo: FieldMetadata<YesNoInput>
}) {
	const field = useField(meta.name)
	const errorId = meta.errors?.length ? `${meta.id}-error` : undefined
	const yesNoErrorId = metaYesNo.errors?.length
	console.log(metaYesNo.id, metaYesNo.value)
	return (
		<div className="flex flex-col gap-4">
			<Label>{field.prompt}</Label>
			<div className="flex gap-x-4">
				{getCollectionProps(metaYesNo, {
					type: 'radio',
					options: YesNoSchema._def.values,
				}).map(({ type: _type, ...props }) => {
					return (
						<div key={props.key} className="flex items-center space-x-2">
							{/* <input type="radio" {...props} /> */}
							<input {...props} id={props.id} type="radio" />
							<Label htmlFor={props.id} className="cursor-pointer">
								{props.value}
							</Label>
						</div>
					)
				})}
			</div>
			<div className="px-4">
				{yesNoErrorId ? (
					<ErrorList id={errorId} errors={metaYesNo.errors} />
				) : null}
			</div>
			{metaYesNo.value === YesNoSchema.enum.Yes ? (
				<TextareaField
					textareaProps={getTextareaProps(meta)}
					labelProps={{
						children: 'Please explain:',
						className: 'font-medium',
					}}
				/>
			) : (
				// we have to set a value, even if the answer is no, or it will be cooerced to undefined
				// this will fail the "required" validation, even though the answer was no
				<input type="hidden" name={field.slug} value="no" />
			)}
			<div className="px-4">
				{errorId ? <ErrorList id={errorId} errors={meta.errors} /> : null}
			</div>
		</div>
	)
}

function YesNoNAField({ meta }: { meta: FieldMetadata<YesNoNAInput> }) {
	const field = useField(meta.name)
	const errorId = meta.errors?.length ? `${meta.id}-error` : undefined
	return (
		<div className="flex flex-col gap-4">
			<Label>{field.prompt}</Label>
			<RadioGroup
				defaultValue={field.record?.answer ?? ''}
				name={field.slug}
				required={field.required}
			>
				<div className="flex gap-4">
					{getCollectionProps(meta, {
						type: 'radio',
						options: ['Yes', 'No', 'N/A'],
					}).map(({ type: _type, ...props }) => {
						const key = props.value.toLowerCase().replace(/\W/g, '')
						return (
							<div key={key} className="flex items-center space-x-2">
								<RadioGroupItem {...props} id={`${field.id}-${key}`} />
								<Label
									htmlFor={`${field.id}-${key}`}
									className="cursor-pointer"
								>
									{props.value}
								</Label>
							</div>
						)
					})}
				</div>
			</RadioGroup>
			<div className="px-4">
				{errorId ? <ErrorList id={errorId} errors={meta.errors} /> : null}
			</div>
		</div>
	)
}

function MultiSelectField({ meta }: { meta: FieldMetadata<MultiSelectInput> }) {
	const field = useField(meta.name)
	const labels = useMemo(() => {
		return field.options.reduce(
			(acc, option) => {
				acc[option.id] = option.value
				return acc
			},
			{} as Record<string, string>,
		)
	}, [field.options])
	const errorId = meta.errors?.length ? `${meta.id}-error` : undefined
	return (
		<div className="flex flex-col gap-4">
			<Label>{field.prompt}</Label>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{getCollectionProps(meta, {
					type: 'checkbox',
					options: field.options.map(option => option.id),
				}).map(props => {
					return (
						<div key={props.key} className="flex items-center space-x-2">
							<Checkbox {...props} type="button" />
							<Label
								htmlFor={props.id}
								className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
							>
								{labels[props.value]}
							</Label>
						</div>
					)
				})}
			</div>
			<div className="px-4">
				{errorId ? <ErrorList id={errorId} errors={meta.errors} /> : null}
			</div>
		</div>
	)
}

export default function () {
	const { form: formWithResponses } = useLoaderData<typeof loader>()
	const lastResult = useActionData<typeof action>()?.result
	const redirectTo = useRedirectTo()
	const location = useLocation()
	const schema = useMemo(
		() => fieldsToSchema(formWithResponses.fields),
		[formWithResponses.fields],
	)
	const [form, fields] = useForm({
		id: location.pathname.split('/').pop() + '-history',
		lastResult,
		constraint: getZodConstraint(schema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		defaultValue: formWithResponses.fields.reduce(
			(acc, field) => ({
				...acc,
				[field.slug]:
					field.type === FieldType.MultiSelect
						? field.record?.selected.map(option => option.id)
						: field.record?.answer ?? '',
			}),
			{ redirectTo },
		),
	})
	const isSubmitting = useIsPending()
	console.log(form.allErrors)

	return (
		<div className="mx-1 flex min-h-full w-full flex-col items-center justify-center">
			<Card className="w-full max-w-xl space-y-2 p-2">
				<CardHeader>
					<h1 className="text-center text-2xl font-bold text-foreground">
						{formWithResponses.name}
					</h1>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<Form
						method="post"
						className="flex flex-col gap-4"
						{...getFormProps(form)}
					>
						<input
							{...getInputProps(fields.redirectTo, {
								type: 'hidden',
							})}
						/>
						{Object.values(formWithResponses.fields).map(field => {
							const meta = fields[field.slug]
							return (
								<div key={meta.id}>
									{field.type === FieldType.Text && (
										<TextField meta={meta as any} />
									)}
									{field.type === FieldType.YesNoDetails && (
										<YesNoDetailsField
											meta={meta as any}
											metaYesNo={
												fields[
													`${field.slug}-${yesNoSuffix}`
												] as FieldMetadata<YesNoInput>
											}
										/>
									)}
									{field.type === FieldType.YesNoNA && (
										<YesNoNAField meta={meta as any} />
									)}
									{field.type === FieldType.MultiSelect && (
										<MultiSelectField meta={meta as any} />
									)}
								</div>
							)
						})}
						<StatusButton
							type="submit"
							status={isSubmitting ? 'pending' : form.status ?? 'idle'}
							className="flex w-full items-center justify-center"
							disabled={isSubmitting}
						>
							{redirectTo ? 'Next' : 'Save'}
						</StatusButton>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}

function useField(slug: string) {
	const { form } = useLoaderData<typeof loader>()
	return form.fields.find(field => field.slug === slug)!
}
