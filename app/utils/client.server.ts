import { redirect } from '@remix-run/node'
import { prisma } from '#/app/utils/db.server'
import { type ToastInput, redirectWithToast } from './toast.server'

const forms = [
	{
		slug: 'general',
		title: 'General Info',
		checker: async (userId: string) => {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: {
					name: true,
					dob: true,
				},
			})
			return user?.name && user?.dob
		},
	},
	{
		slug: 'address',
		title: 'Address',
		checker: async (userId: string) => {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: {
					address: true,
				},
			})
			return user?.address?.addressLine1 && user?.address?.zip
		},
	},
	{
		slug: 'medical-history',
		title: 'Medical History',
		checker: async (userId: string) => {
			return !(
				await prisma.clientHistoryField.findMany({
					where: {
						required: true,
						records: {
							none: {
								userId,
							},
						},
						form: {
							slug: 'medical-history',
						},
					},
					include: {
						form: {
							select: {
								slug: true,
							},
						},
					},
				})
			).length
		},
	},
	{
		slug: 'skin-history',
		title: 'Skin History',
		checker: async (userId: string) => {
			// console.log(
			// 	await prisma.clientHistoryRecord.findMany({
			// 		where: {
			// 			userId,
			// 			field: {
			// 				slug: 'skin-history',
			// 			},
			// 		},
			// 		include: {
			// 			field: true,
			// 		},
			// 	}),
			// )
			// console.log(
			// 	await prisma.clientHistoryField.findMany({
			// 		where: {
			// 			required: true,
			// 			records: {
			// 				none: {
			// 					userId,
			// 				},
			// 			},
			// 			form: {
			// 				slug: 'skin-history',
			// 			},
			// 		},
			// 		include: {
			// 			form: {
			// 				select: {
			// 					slug: true,
			// 				},
			// 			},
			// 		},
			// 	}),
			// )
			return !(
				await prisma.clientHistoryField.findMany({
					where: {
						required: true,
						records: {
							none: {
								userId,
							},
						},
						form: {
							slug: 'skin-history',
						},
					},
					include: {
						form: {
							select: {
								slug: true,
							},
						},
					},
				})
			).length
		},
	},
]

export async function getForms(userId: string) {
	return Promise.all(
		forms.map(async form => {
			return {
				slug: form.slug,
				title: form.title,
				completed: Boolean(await form.checker(userId)),
			}
		}),
	)
}
export async function checkFormRedirect(
	forms: { slug: string; completed: boolean }[],
	toast?: ToastInput,
) {
	for (const form of forms) {
		if (!form.completed) {
			if (toast) {
				throw await redirectWithToast(`/account/info/${form.slug}`, toast)
			}
			throw redirect(`/account/info/${form.slug}`)
		}
	}
}
