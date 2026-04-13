import { type BlvdAttributionTouch } from '@prisma/client'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { format } from 'date-fns'

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { getMissingBlvdBookingPriceServiceNames } from '#app/utils/blvd-booking-pricing.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'

function formatDateTime(value?: Date | string | null) {
	if (!value) return ' - '
	return format(new Date(value), 'MMM d, yyyy h:mm a')
}

function formatCurrency(value?: number | null) {
	if (value == null) return ' - '
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(value)
}

function compactText(value?: string | null) {
	if (!value) return ' - '
	return value
}

function SummaryCard({
	title,
	description,
	value,
}: {
	title: string
	description: string
	value: string
}) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardDescription>{title}</CardDescription>
				<CardTitle className="text-3xl">{value}</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">{description}</p>
			</CardContent>
		</Card>
	)
}

function SectionCard({
	title,
	description,
	children,
}: {
	title: string
	description: string
	children: React.ReactNode
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	)
}

function DataTable({
	headers,
	children,
}: {
	headers: string[]
	children: React.ReactNode
}) {
	return (
		<div className="overflow-x-auto rounded-md border">
			<table className="min-w-full text-sm">
				<thead className="bg-muted/50 text-left">
					<tr>
						{headers.map(header => (
							<th key={header} className="px-4 py-3 font-medium">
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>{children}</tbody>
			</table>
		</div>
	)
}

function TouchBadge({
	touch,
}: {
	touch: Pick<
		BlvdAttributionTouch,
		'trafficSourceDetail' | 'bookEntryPagePrefixType'
	> | null
}) {
	if (!touch) return <span className="text-muted-foreground">Unattributed</span>

	return (
		<div className="flex flex-col gap-1">
			<span className="font-medium">
				{compactText(touch.trafficSourceDetail)}
			</span>
			<span className="text-xs text-muted-foreground">
				{compactText(touch.bookEntryPagePrefixType)}
			</span>
		</div>
	)
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	const [
		clients,
		touches,
		appointments,
		revenueItems,
		syncStates,
		clientCount,
		touchCount,
		appointmentCount,
		revenueCount,
		revenueAggregate,
		attributedRevenueAggregate,
	] = await Promise.all([
		prisma.blvdClient.findMany({
			include: {
				_count: {
					select: {
						attributedRevenueItems: true,
						attributionTouches: true,
					},
				},
			},
			orderBy: [{ latestTouchAt: 'desc' }, { createdAt: 'desc' }],
		}),
		prisma.blvdAttributionTouch.findMany({
			include: {
				blvdClient: true,
				_count: { select: { appointments: true, revenueItems: true } },
			},
			orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
		}),
		prisma.blvdAttributedAppointment.findMany({
			include: {
				touch: {
					include: {
						blvdClient: true,
					},
				},
			},
			orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
		}),
		prisma.blvdRevenueItem.findMany({
			include: {
				blvdClient: true,
				attributionTouch: true,
			},
			orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
		}),
		prisma.blvdSyncState.findMany({ orderBy: { key: 'asc' } }),
		prisma.blvdClient.count(),
		prisma.blvdAttributionTouch.count(),
		prisma.blvdAttributedAppointment.count(),
		prisma.blvdRevenueItem.count(),
		prisma.blvdRevenueItem.aggregate({
			_sum: { grossAmountUsd: true },
		}),
		prisma.blvdRevenueItem.aggregate({
			_sum: { grossAmountUsd: true },
			where: { attributionTouchId: { not: null } },
		}),
	])
	const missingBookingPricingServiceNames =
		getMissingBlvdBookingPriceServiceNames([
			...touches
				.map(touch => touch.bookingServiceName)
				.filter((value): value is string => Boolean(value)),
			...revenueItems.map(item => item.itemName),
		])

	return json({
		clients,
		touches,
		appointments,
		revenueItems,
		syncStates,
		missingBookingPricingServiceNames,
		clientCount,
		touchCount,
		appointmentCount,
		revenueCount,
		revenueGrossUsd: revenueAggregate._sum.grossAmountUsd ?? 0,
		attributedRevenueGrossUsd:
			attributedRevenueAggregate._sum.grossAmountUsd ?? 0,
	})
}

export default function BoulevardAdminPage() {
	const data = useLoaderData<typeof loader>()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-semibold tracking-tight">
					Boulevard Attribution
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Raw Boulevard attribution records currently stored in the app
					database. Use this page to confirm clients, booking touches,
					appointments, revenue, and sync cursor state.
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
				<SummaryCard
					title="Clients"
					description="Distinct Boulevard clients tracked for attribution."
					value={String(data.clientCount)}
				/>
				<SummaryCard
					title="Touches"
					description="Attributed booking touches written from the custom /book flow."
					value={String(data.touchCount)}
				/>
				<SummaryCard
					title="Appointments"
					description="Booked Boulevard appointments mapped back to a touch."
					value={String(data.appointmentCount)}
				/>
				<SummaryCard
					title="Revenue Items"
					description="Normalized downstream Boulevard revenue rows."
					value={String(data.revenueCount)}
				/>
				<SummaryCard
					title="Attributed Revenue"
					description={`Total gross ${formatCurrency(data.revenueGrossUsd)} | attributed ${formatCurrency(data.attributedRevenueGrossUsd)}`}
					value={formatCurrency(data.attributedRevenueGrossUsd)}
				/>
				<SummaryCard
					title="Missing Booking Prices"
					description="Boulevard service names found in touches or revenue without a booking price mapping."
					value={String(data.missingBookingPricingServiceNames.length)}
				/>
			</div>

			<div className="space-y-6">
				<SectionCard
					title="Booking Pricing Audit"
					description="These Boulevard service names are missing from the booking pricing catalog and need explicit pricing copy."
				>
					{data.missingBookingPricingServiceNames.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							All Boulevard service names seen in touches and revenue currently
							have booking pricing configured.
						</p>
					) : (
						<DataTable headers={['Service Name']}>
							{data.missingBookingPricingServiceNames.map(serviceName => (
								<tr key={serviceName} className="border-t align-top">
									<td className="px-4 py-3">{serviceName}</td>
								</tr>
							))}
						</DataTable>
					)}
				</SectionCard>

				<SectionCard
					title="Clients"
					description="Every Boulevard client currently tracked in the local attribution ledger."
				>
					<DataTable
						headers={[
							'Boulevard Client ID',
							'Name',
							'Email',
							'Phone',
							'Touches',
							'Revenue Items',
							'Latest Touch',
						]}
					>
						{data.clients.map(client => (
							<tr key={client.id} className="border-t align-top">
								<td className="px-4 py-3 font-mono text-xs">
									{client.boulevardClientId}
								</td>
								<td className="px-4 py-3">
									{[client.firstName, client.lastName]
										.filter(Boolean)
										.join(' ') || ' - '}
								</td>
								<td className="px-4 py-3">{compactText(client.email)}</td>
								<td className="px-4 py-3">{compactText(client.phone)}</td>
								<td className="px-4 py-3">
									{client._count.attributionTouches}
								</td>
								<td className="px-4 py-3">
									{client._count.attributedRevenueItems}
								</td>
								<td className="px-4 py-3">
									{formatDateTime(client.latestTouchAt)}
								</td>
							</tr>
						))}
					</DataTable>
				</SectionCard>

				<SectionCard
					title="Attribution Touches"
					description="Each completed attributable booking touch currently stored in the ledger."
				>
					<DataTable
						headers={[
							'Occurred',
							'Client',
							'Source',
							'Entry Page',
							'Service',
							'Location',
							'Appts',
							'Revenue Rows',
							'Cart',
						]}
					>
						{data.touches.map(touch => (
							<tr key={touch.id} className="border-t align-top">
								<td className="whitespace-nowrap px-4 py-3">
									{formatDateTime(touch.occurredAt)}
								</td>
								<td className="px-4 py-3">
									<div className="font-mono text-xs">
										{touch.blvdClient.boulevardClientId}
									</div>
									<div className="text-muted-foreground">
										{[touch.blvdClient.firstName, touch.blvdClient.lastName]
											.filter(Boolean)
											.join(' ') || ' - '}
									</div>
								</td>
								<td className="px-4 py-3">
									<div>{compactText(touch.trafficSourceDetail)}</div>
									<div className="text-xs text-muted-foreground">
										{compactText(touch.trafficChannel)} /{' '}
										{compactText(touch.trafficPlatform)}
									</div>
								</td>
								<td className="px-4 py-3">
									<div>{compactText(touch.bookEntryPagePrefixType)}</div>
									<div className="text-xs text-muted-foreground">
										{compactText(touch.bookEntryFromPath)}
									</div>
								</td>
								<td className="px-4 py-3">
									<div>{compactText(touch.bookingServiceName)}</div>
									<div className="text-xs text-muted-foreground">
										{compactText(touch.bookingServiceCategory)}
									</div>
								</td>
								<td className="px-4 py-3">
									{compactText(touch.bookingLocationName)}
								</td>
								<td className="px-4 py-3">{touch._count.appointments}</td>
								<td className="px-4 py-3">{touch._count.revenueItems}</td>
								<td className="px-4 py-3 font-mono text-xs">
									{compactText(touch.bookingCartId)}
								</td>
							</tr>
						))}
					</DataTable>
				</SectionCard>

				<SectionCard
					title="Attributed Appointments"
					description="Boulevard appointment IDs mapped back to the originating attribution touch."
				>
					<DataTable
						headers={[
							'Appointment ID',
							'Client',
							'Start',
							'End',
							'Touch Source',
							'Service',
						]}
					>
						{data.appointments.map(appointment => (
							<tr key={appointment.id} className="border-t align-top">
								<td className="px-4 py-3 font-mono text-xs">
									{appointment.boulevardAppointmentId}
								</td>
								<td className="px-4 py-3">
									<div className="font-mono text-xs">
										{appointment.touch.blvdClient.boulevardClientId}
									</div>
									<div className="text-muted-foreground">
										{[
											appointment.touch.blvdClient.firstName,
											appointment.touch.blvdClient.lastName,
										]
											.filter(Boolean)
											.join(' ') || ' - '}
									</div>
								</td>
								<td className="whitespace-nowrap px-4 py-3">
									{formatDateTime(appointment.startTime)}
								</td>
								<td className="whitespace-nowrap px-4 py-3">
									{formatDateTime(appointment.endTime)}
								</td>
								<td className="px-4 py-3">
									<TouchBadge touch={appointment.touch} />
								</td>
								<td className="px-4 py-3">
									{compactText(appointment.touch.bookingServiceName)}
								</td>
							</tr>
						))}
					</DataTable>
				</SectionCard>

				<SectionCard
					title="Revenue Items"
					description="Normalized downstream Boulevard revenue with the currently resolved attribution touch."
				>
					<DataTable
						headers={[
							'Occurred',
							'External ID',
							'Client',
							'Item',
							'Gross',
							'Attribution',
							'Method',
						]}
					>
						{data.revenueItems.map(
							(item: (typeof data.revenueItems)[number]) => (
								<tr key={item.id} className="border-t align-top">
									<td className="whitespace-nowrap px-4 py-3">
										{formatDateTime(item.occurredAt)}
									</td>
									<td className="px-4 py-3 font-mono text-xs">
										{item.externalId}
									</td>
									<td className="px-4 py-3">
										<div className="font-mono text-xs">
											{compactText(item.boulevardClientId)}
										</div>
										<div className="text-muted-foreground">
											{[item.blvdClient?.firstName, item.blvdClient?.lastName]
												.filter(Boolean)
												.join(' ') || ' - '}
										</div>
									</td>
									<td className="px-4 py-3">
										<div>{item.itemName}</div>
										<div className="text-xs text-muted-foreground">
											{compactText(item.serviceCategory)}
										</div>
									</td>
									<td className="px-4 py-3">
										{formatCurrency(item.grossAmountUsd)}
									</td>
									<td className="px-4 py-3">
										<TouchBadge touch={item.attributionTouch} />
									</td>
									<td className="px-4 py-3">
										{compactText(item.attributionMethod)}
									</td>
								</tr>
							),
						)}
					</DataTable>
				</SectionCard>

				<SectionCard
					title="Sync State"
					description="Operational cursors and state for Boulevard import and reconciliation jobs."
				>
					<DataTable headers={['Key', 'Value', 'Updated']}>
						{data.syncStates.map(state => (
							<tr key={state.key} className="border-t align-top">
								<td className="px-4 py-3 font-mono text-xs">{state.key}</td>
								<td className="px-4 py-3">{compactText(state.value)}</td>
								<td className="whitespace-nowrap px-4 py-3">
									{formatDateTime(state.updatedAt)}
								</td>
							</tr>
						))}
					</DataTable>
				</SectionCard>
			</div>
		</div>
	)
}
