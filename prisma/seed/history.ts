import { FieldType } from '#app/routes/account+/info+/info.js'
import { prisma } from '#app/utils/db.server'

type Field = {
	prompt: string
	type: FieldType
	options?: string[]
	slug: string
	required?: boolean
}

const skinHistoryFields: Field[] = [
	{
		prompt:
			'Are you currently taking or have recently taken any acne medications, i.e., Accutane, Epiduo?',
		type: FieldType.YesNoDetails,
		slug: 'acne-medications',
		required: true,
	},
	{
		prompt:
			'Have you used Retin-A, any other vitamin-A derivatives, or AHAs in the last 3 months?',
		type: FieldType.YesNoDetails,
		slug: 'retin-a',
		required: true,
	},
	{
		prompt:
			'Have you had any chemical peel, microdermabrasion, microneedling, laser treatment, facial waxing or other cosmetic treatment in the last 3 months?',
		type: FieldType.YesNoDetails,
		slug: 'cosmetic-treatment',
		required: true,
	},
	{
		prompt: 'Are you under dermatologist care?',
		type: FieldType.YesNoDetails,
		slug: 'dermatologist-care',
		required: true,
	},
	{
		prompt: 'Have you had any surgeries, including plastic surgery?',
		type: FieldType.YesNoDetails,
		slug: 'surgeries',
		required: true,
	},
	{
		prompt:
			'How much time do you spend in the sun, and what is your level of sun protection?',
		type: FieldType.Text,
		slug: 'sun-exposure',
		required: true,
	},
]

const medicalHistoryFields: Field[] = [
	{
		prompt: 'Please select any relevant conditions below:',
		type: FieldType.MultiSelect,
		options: [
			'None',
			'Active acne',
			'Asthma',
			'Autoimmune condition',
			'Blood clots/blood disorder',
			'Cancer or history of cancer',
			'Cold sores/fever blisters',
			'Diabetes',
			'Eczema',
			'Epilepsy or seizures',
			'Fainting',
			'Heart disease',
			'High blood pressure',
			'HIV/AIDS or Hepatitis',
			'Keloid scarring',
			'Kidney disease',
			'Liver condition',
			'Psoriasis',
			'Respiratory condition',
			'Rosacea',
			'Staph infections/MRSA',
			'Thyroid condition',
		],
		slug: 'conditions',
		required: true,
	},
	{
		prompt: 'Details or any other conditions:',
		type: FieldType.Text,
		slug: 'other-conditions',
		required: false,
	},
	{
		prompt: 'Are you allergic to any of the following substances?',
		type: FieldType.MultiSelect,
		options: [
			'None',
			'Topic or local anaesthetics (lidocaine, tetracaine, dermacaine, epinephrine)',
			'Vitamin E',
			'Benzyl alcohol',
			'Carbopol',
			'Latex/rubber',
			'Propylene glycol',
		],
		slug: 'allergies',
		required: true,
	},
	{
		prompt: 'Do you have any other allergies?',
		type: FieldType.YesNoDetails,
		slug: 'other-allergies',
		required: true,
	},
	{
		prompt:
			'Please list any medication you take, including supplements or aspirin:',
		type: FieldType.Text,
		slug: 'medication',
		required: false,
	},
	{
		prompt: 'Are you currently taking any blood thinning drugs?',
		type: FieldType.YesNoDetails,
		slug: 'blood-thinning',
		required: true,
	},
	{
		prompt: 'Are you currently pregnant or breastfeeding?',
		type: FieldType.YesNoNA,
		slug: 'pregnant-breastfeeding',
		required: true,
	},
]

async function addForm(
	formInfo: { slug: string; name: string; order: number },
	fields: Field[],
) {
	const form = await prisma.clientHistoryForm.upsert({
		where: { slug: formInfo.slug },
		create: formInfo,
		update: formInfo,
	})

	for (const [i, fieldInfo] of Object.entries(fields)) {
		const data = {
			prompt: fieldInfo.prompt,
			type: fieldInfo.type,
			slug: fieldInfo.slug,
			formId: form.id,
			order: Number(i) * 1000,
			required: fieldInfo.required || false,
		}
		const field = await prisma.clientHistoryField.upsert({
			where: { slug: fieldInfo.slug },
			create: data,
			update: data,
		})
		for (const [i, option] of Object.entries(
			fieldInfo.options || ([] as string[]),
		)) {
			await prisma.clientHistoryFieldOption.upsert({
				where: {
					fieldId_value: {
						fieldId: field.id,
						value: option,
					},
				},
				create: {
					fieldId: field.id,
					value: option,
					order: Number(i) * 1000,
				},
				update: {
					fieldId: field.id,
					value: option,
					order: Number(i) * 1000,
				},
			})
		}
	}
}

async function main() {
	const medicalHistory = {
		slug: 'medical-history',
		name: 'Medical History',
		order: 1000,
	}
	await addForm(medicalHistory, medicalHistoryFields)
	const skinHistory = {
		slug: 'skin-history',
		name: 'Skin History',
		order: 2000,
	}
	await addForm(skinHistory, skinHistoryFields)
}

main()
