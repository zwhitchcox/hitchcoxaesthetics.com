import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useFetcher, useLoaderData } from '@remix-run/react'
import { useEffect, useState } from 'react'

import { bookStepper } from '#/app/routes/book+/book.server'
import { Button } from '#app/components/ui/button'
import { Calendar } from '#app/components/ui/calendar'
import { useBookData } from '#app/routes/book+/_steps+/_layout'
import { dateToMinutes } from '#app/utils/date'
import { useSafeLayoutEffect } from '#app/utils/misc.js'

const MINUTE_INTERVAL = 10

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function action({ request }: ActionFunctionArgs) {
	return bookStepper.action('schedule')({ request })
}

export async function loader({ request }: LoaderFunctionArgs) {
	return bookStepper.loader('schedule')({ request })
}

type WindowHash = Record<string, { start: number; end: number }[]>

function getMonthDates(date: Date) {
	const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 1)
	const dates: string[] = []
	for (let d = new Date(date); d <= endDate; d.setDate(d.getDate() + 1)) {
		dates.push(getDateString(d))
	}
	return dates
}

function pad(num: number) {
	return String(num).padStart(2, '0')
}

function getDateString(date: Date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate(),
	)}`
}

function useAvailableWindows(
	date: Date | undefined,
	providerId: string | undefined,
) {
	const fetcher = useFetcher<WindowHash>()
	const [availableWindows, setAvailableWindows] = useState<WindowHash>({})
	const dateString = date && getDateString(date)
	const dates = date && getMonthDates(date)
	useEffect(() => {
		if (!dates) return
		if (fetcher.state !== 'idle') return
		if (!dateString) return
		const allWindows = { ...availableWindows, ...fetcher.data }
		if (
			Object.keys(allWindows).sort().join() !==
			Object.keys(availableWindows).sort().join()
		) {
			setAvailableWindows(allWindows)
		}
		if (dates.every(d => allWindows[d])) return
		const params = new URLSearchParams()
		for (const d of dates) {
			params.append('date', d)
		}
		fetcher.submit(params, {
			action: `/book/available-windows/${providerId}`,
		})
	}, [fetcher, dateString, availableWindows, providerId, date, dates])
	return { ...availableWindows, ...fetcher.data } as WindowHash
}

export function generateTimeSlots(
	window: { start: number; end: number },
	duration: number,
) {
	let slots: Date[] = []
	let currentTime = new Date()
	currentTime.setHours(0, 0, 0, 0)
	currentTime.setMinutes(window.start)
	while (dateToMinutes(currentTime) + duration <= window.end) {
		slots.push(new Date(currentTime))
		currentTime.setMinutes(currentTime.getMinutes() + MINUTE_INTERVAL)
	}
	return slots
}

export default function ScheduleStep() {
	const data = useLoaderData<typeof loader>()
	const { appointment } = useBookData()
	const [date, setDate] = useState<Date | undefined>(
		appointment ? new Date(appointment?.windowStart) : new Date(),
	)
	const [time, setTime] = useState<number | undefined>(
		appointment ? new Date(appointment?.windowStart).getTime() : undefined,
	)
	const allWindows = useAvailableWindows(date, data.providerId)
	const dateString = date && getDateString(date)
	const windows = dateString ? allWindows[dateString] : []
	const { services, serviceId } = useBookData()
	const duration = serviceId
		? services.find(s => s.id === serviceId)!.duration
		: 0
	const availableSlots = windows?.reduce(
		(acc: Date[], window) => [...acc, ...generateTimeSlots(window, duration)],
		[],
	)
	const [maxHeight, setMaxHeight] = useState<number>()

	useSafeLayoutEffect(() => {
		const check = () => {
			setMaxHeight(
				window.innerWidth > 1024
					? document.getElementById('calendar')?.scrollHeight ?? 0
					: undefined,
			)
		}
		check()
		setTimeout(() => {
			check()
		}, 300)
		window.addEventListener('resize', check)
		return () => window.removeEventListener('resize', check)
	}, [])

	return (
		<div className="flex flex-col items-center space-y-8 px-2 md:space-y-0">
			<h2 className="mb-4 text-center text-2xl font-semibold tracking-widest text-gray-600">
				Schedule
			</h2>
			<div className="grid w-[40rem] flex-1 grid-cols-1 justify-center gap-6 lg:grid-cols-2">
				<Calendar
					id="calendar"
					mode="single"
					className="col-span-1"
					selected={date}
					onSelect={d => {
						setDate(d)
						setTime(d?.getTime())
					}}
					disabled={calDate => {
						const today = new Date()
						today.setHours(0, 0, 0, 0)
						if (calDate < today) {
							return true
						}
						const dateString = getDateString(calDate)
						if (!allWindows[dateString]) {
							return false
						}
						if (!allWindows[dateString].length) {
							return true
						}
						return false
					}}
					initialFocus
				/>
				<Form
					method="post"
					className={`col-span-1 h-full min-h-0 space-y-1 lg:overflow-y-scroll`}
					style={{
						maxHeight,
					}}
				>
					{availableSlots ? (
						availableSlots.length > 0 ? (
							availableSlots.map((slot, index) => {
								const newDate = new Date(date!)
								newDate.setHours(slot.getHours(), slot.getMinutes())
								return (
									<Button
										key={index}
										variant={time === slot.getTime() ? 'secondary' : 'default'}
										className={`block h-11 w-full border transition duration-300 hover:border-gray-400`}
										type="submit"
										name="date"
										value={newDate.toISOString()}
									>
										{slot.toLocaleTimeString('en-US', {
											hour: '2-digit',
											minute: '2-digit',
											hour12: true,
										})}
									</Button>
								)
							})
						) : (
							'No appointment times available for this date.'
						)
					) : (
						<div className="text-center text-gray-600">
							{date ? 'Loading...' : 'Select a Date.'}
						</div>
					)}
				</Form>
			</div>
		</div>
	)
}
