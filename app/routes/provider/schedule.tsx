import { parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
	type SerializeFrom,
} from '@remix-run/node'
import {
	Form,
	useFetchers,
	useLoaderData,
	useRevalidator,
} from '@remix-run/react'
import { useEffect, useState } from 'react'
import { z } from 'zod'

import { Button } from '#app/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '#app/components/ui/dialog'
import { Input } from '#app/components/ui/input'
import { Label } from '#app/components/ui/label'
import AppointmentEdit from '#app/routes/users+/$id_+/appointments/AppointmentEdit.js'
import { requireProvider, requireUser } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { AppointmentStatus, UserType } from '#app/utils/types'

enum Intent {
	Delete = 'Delete',
	Upsert = 'Upsert',
}

const UpsertSchema = z.object({
	reason: z.string().min(1),
	id: z.string().optional(),
	intent: z.literal(Intent.Upsert),
	start: z.date(),
	end: z.date(),
})

const DeleteSchema = z.object({
	id: z.string().min(1),
	intent: z.literal(Intent.Delete),
})

const BlockedTimeSchema = z
	.discriminatedUnion('intent', [UpsertSchema, DeleteSchema])
	.refine(
		data => {
			if (data.intent === Intent.Upsert) {
				return data.start < data.end
			}
			return true
		},
		{
			message: 'End time must be greater than start time',
			path: ['end'],
		},
	)

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUser(request)
	if (!user || user.type !== UserType.Provider) {
		return new Response('Unauthorized', { status: 401 })
	}

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: BlockedTimeSchema })
	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{
				status: submission.status === 'error' ? 400 : 200,
			},
		)
	}
	const { intent } = submission.value
	switch (intent) {
		case Intent.Delete: {
			const { id } = submission.value
			await prisma.blockedTime.delete({
				where: {
					id,
				},
			})
			return null
		}
		case Intent.Upsert: {
			const { start, end, reason, id } = submission.value
			const data = {
				providerId: user.id,
				start: new Date(start.toString()),
				end: new Date(end.toString()),
				reason: reason.toString(),
			}
			if (id) {
				invariant(typeof id === 'string', 'id must be a string')
				await prisma.blockedTime.update({
					where: {
						id,
					},
					data,
				})
			} else {
				await prisma.blockedTime.create({
					data,
				})
			}
			break
		}
		default:
			return new Response('Invalid intent', { status: 400 })
	}

	return null
}

export async function loader({ request }: LoaderFunctionArgs) {
	const provider = await requireProvider(request)
	// const date = new Date()

	const appointments = await prisma.appointment.findMany({
		where: {
			providerId: provider.id,
			status: {
				not: AppointmentStatus.Cancelled,
			},
			// windowStart: {
			// 	gte: startOfWeek(date),
			// 	lte: endOfWeek(date),
			// },
		},
		include: {
			service: true,
			client: true,
		},
	})

	const blockedTimes = await prisma.blockedTime.findMany({
		where: {
			providerId: provider.id,
			// start: {
			// 	gte: startOfWeek(date),
			// 	lte: endOfWeek(date),
			// },
		},
	})

	return json({ appointments, blockedTimes })
}

export default function Schedule() {
	const { appointments, blockedTimes } = useLoaderData<typeof loader>()
	const [selectedEvent, setSelectedEvent] = useState<{
		appointment: any
		blockedTime: any
	} | null>(null)

	const handleEventClick = (clickInfo: any) => {
		setSelectedEvent(clickInfo.event.extendedProps)
	}

	const closeDialog = () => {
		setSelectedEvent(null)
	}
	const cancelled = useCancelled()
	const events = [
		...appointments
			.map(appointment => ({
				extendedProps: {
					appointment,
				},
				title: `${appointment.service.title} - ${appointment.client.name}`,
				start: new Date(appointment.windowStart),
				end: new Date(appointment.windowEnd),
				color: '#6d9eeb',
			}))
			.filter(event => {
				if (cancelled.includes(event.extendedProps.appointment.id)) {
					return false
				}
				return true
			}),
		...blockedTimes.map(blockedTime => ({
			extendedProps: {
				blockedTime,
			},
			title: 'Blocked',
			start: new Date(blockedTime.start),
			end: new Date(blockedTime.end),
			color: '#e06666',
		})),
	]

	return (
		<div className="mx-auto my-4 w-full max-w-4xl">
			<Button
				onClick={() =>
					setSelectedEvent({
						appointment: null,
						blockedTime: {
							start: new Date().toISOString(),
							end: new Date().toISOString(),
							reason: '',
						},
					})
				}
				className="mb-2"
			>
				Block Off Time
			</Button>
			<FullCalendar
				plugins={[dayGridPlugin, listPlugin]}
				initialView="listWeek"
				headerToolbar={{
					left: 'prev,next today',
					center: 'title',
					right: 'dayGridMonth,dayGridWeek,dayGridDay,listWeek',
				}}
				eventClick={handleEventClick}
				events={events}
				eventColor="#378006"
				eventDisplay="block"
				eventContent={function (arg) {
					const { appointment, blockedTime } = arg.event.extendedProps
					if (appointment) {
						return (
							<div className="cursor-pointer">
								<p>
									{appointment.service.title} - {appointment.client.name}
								</p>
							</div>
						)
					}
					if (blockedTime) {
						return <p>{blockedTime.reason}</p>
					}
					return null
				}}
			/>
			<EventDialog onClose={closeDialog} data={selectedEvent} />
		</div>
	)
}

// function startOfWeek(date: Date) {
// 	const diff = date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1)
// 	return new Date(date.setDate(diff))
// }

// function endOfWeek(date: Date) {
// 	const lastOfDay = startOfWeek(new Date(date))
// 	lastOfDay.setDate(lastOfDay.getDate() + 6)
// 	return lastOfDay
// }

function EventDialog({
	onClose,
	data,
}: {
	onClose: () => void
	data: {
		appointment?: SerializeFrom<typeof loader>['appointments'][number]
		blockedTime: SerializeFrom<typeof loader>['blockedTimes'][number]
	} | null
}) {
	return (
		<Dialog
			open={!!data}
			onOpenChange={isOpen => {
				if (!isOpen) onClose()
			}}
		>
			<DialogContent className="bg-white sm:max-w-md">
				{data?.appointment && (
					<AppointmentEdit
						appointment={data?.appointment}
						onSubmit={onClose}
						client={data?.appointment?.client}
					/>
				)}
				{data?.blockedTime && (
					<BlockEdit blockedTime={data?.blockedTime} onClose={onClose} />
				)}
			</DialogContent>
		</Dialog>
	)
}

function BlockEdit({
	blockedTime,
	onClose,
}: {
	blockedTime: SerializeFrom<typeof loader>['blockedTimes'][number]
	onClose: () => void
}) {
	const [startTime, setStartTime] = useState(blockedTime.start)
	const [endTime, setEndTime] = useState(blockedTime.end)
	useEffect(() => {
		if (new Date(endTime) < new Date(startTime)) {
			setEndTime(
				new Date(new Date(startTime).getTime() + 60 * 60).toISOString(),
			)
		}
	}, [startTime, endTime])
	return (
		<Form method="post" onSubmit={onClose}>
			<DialogHeader>
				<DialogTitle>Create Block</DialogTitle>
				<DialogDescription>
					Create a new block of time where you're not available.
				</DialogDescription>
			</DialogHeader>
			<div className="grid gap-4 py-4">
				<div className="grid grid-cols-4 items-center gap-4">
					<Label htmlFor="reason" className="text-right">
						Reason
					</Label>
					<Input
						id="reason"
						name="reason"
						defaultValue={blockedTime.reason}
						className="col-span-3"
						required
					/>
				</div>
				<div className="grid grid-cols-4 items-center gap-4">
					<Label htmlFor="start" className="text-right">
						Start
					</Label>
					<Input
						id="start"
						type="datetime-local"
						name="start"
						value={toLocalDateTimeString(startTime)}
						onChange={e => setStartTime(e.target.value)}
						// defaultValue={toLocalDateTimeString(blockedTime.start)}
						className="col-span-3"
						required
					/>
				</div>
				<div className="grid grid-cols-4 items-center gap-4">
					<Label htmlFor="end" className="text-right">
						End
					</Label>
					<Input
						id="end"
						type="datetime-local"
						name="end"
						// defaultValue={toLocalDateTimeString(blockedTime.end)}
						value={toLocalDateTimeString(endTime)}
						onChange={e => setEndTime(e.target.value)}
						className="col-span-3"
						required
					/>
				</div>
				<input type="hidden" name="id" value={blockedTime.id} />
			</div>
			<DialogFooter>
				{blockedTime.id && (
					<Button type="submit" name="intent" value={Intent.Delete}>
						Delete
					</Button>
				)}
				<Button type="submit" name="intent" value={Intent.Upsert}>
					Save changes
				</Button>
			</DialogFooter>
		</Form>
	)
}

function toLocalDateTimeString(date: string | Date) {
	if (!(date instanceof Date)) date = new Date(date)
	const tzOffset = date.getTimezoneOffset() * 60000
	const localISOTime = new Date(+date - tzOffset).toISOString().slice(0, -1)
	return localISOTime.substring(0, 16)
}

function useCancelled() {
	const { revalidate } = useRevalidator()
	type PendingCancellation = ReturnType<typeof useFetchers>[number] & {
		formData: FormData
	}
	const cancelled = useFetchers()
		.filter((fetcher): fetcher is PendingCancellation => {
			if (!fetcher.formData) return false
			return fetcher.formData.get('intent') === 'cancel'
		})
		.map(fetcher => {
			return fetcher.formData.get('appointmentId')
		})
	const [hasRendered, setHasRendered] = useState(false)
	useEffect(() => {
		if (!hasRendered) {
			return setHasRendered(true)
		}
		if (!cancelled.length) {
			revalidate()
		}
	}, [cancelled.length, hasRendered, revalidate])
	return cancelled
}
