import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useLoaderData,
	useNavigation,
	useSearchParams,
} from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { prisma } from '#app/utils/db.server.ts'
import {
	disconnectGoogleVoice,
	getGoogleOAuthConfig,
	getGoogleVoiceConnection,
	syncFollowUpContacts,
} from '#app/utils/follow-ups.server.ts'
import { normalizePhoneNumber } from '#app/utils/callrail-booking.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const [followUps, googleConnection] = await Promise.all([
		prisma.followUp.findMany({
			orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
			take: 200,
		}),
		getGoogleVoiceConnection(),
	])
	const callIds = followUps
		.map(followUp => followUp.callrailCallId)
		.filter((id): id is string => Boolean(id))
	const calls = callIds.length
		? await prisma.callRailCall.findMany({
				where: { callrailCallId: { in: callIds } },
				select: {
					callrailCallId: true,
					startedAt: true,
					outcome: true,
					disposition: true,
					lostReason: true,
				},
			})
		: []
	const callsById = Object.fromEntries(
		calls.map(call => [call.callrailCallId, call]),
	)
	return json({
		followUps: followUps.map(followUp => ({
			...followUp,
			call: followUp.callrailCallId
				? (callsById[followUp.callrailCallId] ?? null)
				: null,
		})),
		google: {
			configured: Boolean(getGoogleOAuthConfig()),
			connectedEmail: googleConnection?.accountEmail ?? null,
			connected: Boolean(googleConnection),
		},
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const intent = formData.get('intent')

	switch (intent) {
		case 'sync-now': {
			const result = await syncFollowUpContacts()
			return json({ syncResult: result })
		}
		case 'add-follow-up': {
			const rawPhone = String(formData.get('phone') ?? '')
			const phone = normalizePhoneNumber(rawPhone) ?? rawPhone.trim()
			const name = String(formData.get('name') ?? '').trim() || null
			const reason = String(formData.get('reason') ?? '').trim() || null
			if (!phone) return json({ error: 'Phone is required.' }, { status: 400 })
			await prisma.followUp.create({
				data: {
					customerPhone: phone,
					customerName: name,
					reason,
					source: 'manual',
				},
			})
			return json({ ok: true })
		}
		case 'set-status': {
			const id = String(formData.get('id') ?? '')
			const status = String(formData.get('status') ?? '')
			if (
				!id ||
				!['pending', 'contacted', 'resolved', 'dismissed'].includes(status)
			) {
				return json({ error: 'Invalid status update.' }, { status: 400 })
			}
			await prisma.followUp.update({
				where: { id },
				data: {
					status,
					...(status === 'contacted'
						? { contactedAt: new Date(), contactedVia: 'manual' }
						: {}),
				},
			})
			return json({ ok: true })
		}
		case 'disconnect-google': {
			await disconnectGoogleVoice()
			return json({ ok: true })
		}
		default:
			return json({ error: 'Unknown intent.' }, { status: 400 })
	}
}

const STATUS_STYLES: Record<string, string> = {
	pending: 'bg-amber-100 text-amber-900',
	contacted: 'bg-blue-100 text-blue-900',
	resolved: 'bg-green-100 text-green-900',
	dismissed: 'bg-muted text-muted-foreground',
}

export default function FollowUpsAdmin() {
	const { followUps, google } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const [searchParams] = useSearchParams()
	const busy = navigation.state !== 'idle'
	const googleStatus = searchParams.get('google')

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold">Follow-ups</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Created automatically when call analysis flags a warm prospect who did
					not book. A pending follow-up is marked contacted when an outbound
					call to that customer shows up in CallRail (or Google Voice when
					connected), or you can mark it manually.
				</p>
			</div>

			{googleStatus ? (
				<div
					className={`rounded-md border p-3 text-sm ${
						googleStatus === 'connected'
							? 'border-green-300 bg-green-50 text-green-900'
							: 'border-amber-300 bg-amber-50 text-amber-900'
					}`}
				>
					{googleStatus === 'connected'
						? 'Google account connected.'
						: googleStatus === 'missing_env'
							? 'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first (Google Cloud Console > OAuth client, redirect URI: <origin>/admin/google-oauth).'
							: `Google connection failed: ${googleStatus}`}
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-2">
				<Form method="post">
					<input type="hidden" name="intent" value="sync-now" />
					<Button type="submit" disabled={busy}>
						Check for outbound calls now
					</Button>
				</Form>
				{google.connected ? (
					<Form method="post" className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground">
							Google Voice: {google.connectedEmail ?? 'connected'}
						</span>
						<input type="hidden" name="intent" value="disconnect-google" />
						<Button type="submit" variant="outline" size="sm" disabled={busy}>
							Disconnect
						</Button>
					</Form>
				) : google.configured ? (
					<Button asChild variant="outline">
						<Link to="/admin/google-oauth">Connect Google Voice</Link>
					</Button>
				) : (
					<span className="text-sm text-muted-foreground">
						Google Voice sync needs GOOGLE_OAUTH_CLIENT_ID /
						GOOGLE_OAUTH_CLIENT_SECRET (Workspace Voice only; consumer Google
						Voice has no API).
					</span>
				)}
			</div>

			<div className="rounded-lg border bg-card p-4 shadow">
				<h3 className="text-lg font-semibold">Add follow-up</h3>
				<Form method="post" className="mt-2 flex flex-wrap items-center gap-2">
					<input type="hidden" name="intent" value="add-follow-up" />
					<Input
						name="phone"
						placeholder="(865) 555-0100"
						className="h-8 w-44 text-sm"
						required
					/>
					<Input
						name="name"
						placeholder="Name (optional)"
						className="h-8 w-44 text-sm"
					/>
					<Input
						name="reason"
						placeholder="Why follow up?"
						className="h-8 max-w-md flex-1 text-sm"
					/>
					<Button type="submit" size="sm" disabled={busy}>
						Add
					</Button>
				</Form>
			</div>

			<div className="overflow-x-auto rounded-lg border bg-card shadow">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b bg-muted/50 text-left">
							<th className="px-3 py-2">Customer</th>
							<th className="px-3 py-2">Reason</th>
							<th className="px-3 py-2">Status</th>
							<th className="px-3 py-2">Contacted</th>
							<th className="px-3 py-2">Created</th>
							<th className="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{followUps.length === 0 ? (
							<tr>
								<td
									colSpan={6}
									className="px-3 py-6 text-center text-muted-foreground"
								>
									No follow-ups yet. They appear here when call analysis flags a
									warm prospect who did not book.
								</td>
							</tr>
						) : null}
						{followUps.map(followUp => (
							<tr key={followUp.id} className="border-b align-top">
								<td className="px-3 py-2">
									<div className="font-medium">
										{followUp.customerName ?? 'Unknown'}
									</div>
									<div className="text-muted-foreground">
										{followUp.customerPhone}
									</div>
								</td>
								<td className="max-w-md px-3 py-2">
									<div>{followUp.reason ?? '-'}</div>
									{followUp.call?.lostReason ? (
										<div className="mt-1 text-xs text-muted-foreground">
											Lost: {followUp.call.lostReason}
										</div>
									) : null}
								</td>
								<td className="px-3 py-2">
									<span
										className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[followUp.status] ?? ''}`}
									>
										{followUp.status}
									</span>
								</td>
								<td className="px-3 py-2 text-muted-foreground">
									{followUp.contactedAt
										? `${new Date(followUp.contactedAt).toLocaleDateString()} (${followUp.contactedVia ?? '?'})`
										: '-'}
								</td>
								<td className="px-3 py-2 text-muted-foreground">
									{new Date(followUp.createdAt).toLocaleDateString()}
								</td>
								<td className="px-3 py-2">
									<div className="flex gap-1">
										{followUp.status === 'pending' ? (
											<StatusButton
												id={followUp.id}
												status="contacted"
												label="Mark contacted"
												busy={busy}
											/>
										) : null}
										{followUp.status !== 'resolved' &&
										followUp.status !== 'dismissed' ? (
											<StatusButton
												id={followUp.id}
												status="resolved"
												label="Resolve"
												busy={busy}
											/>
										) : null}
										{followUp.status === 'pending' ? (
											<StatusButton
												id={followUp.id}
												status="dismissed"
												label="Dismiss"
												busy={busy}
											/>
										) : null}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}

function StatusButton({
	id,
	status,
	label,
	busy,
}: {
	id: string
	status: string
	label: string
	busy: boolean
}) {
	return (
		<Form method="post">
			<input type="hidden" name="intent" value="set-status" />
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="status" value={status} />
			<Button type="submit" variant="outline" size="sm" disabled={busy}>
				{label}
			</Button>
		</Form>
	)
}
