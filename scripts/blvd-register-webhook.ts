/**
 * Registers the Boulevard APPOINTMENT_COMPLETED webhook pointing at the
 * production site so review-reminder texts fire at checkout. Idempotent:
 * skips creation when a webhook already points at the URL. `--ping` sends a
 * test delivery to the registered webhook.
 *
 *   pnpm tsx --env-file=.env scripts/blvd-register-webhook.ts [--ping] [--url=https://...]
 */
import { boulevardAdminFetch } from '#app/utils/blvd-admin.server.ts'

const DEFAULT_URL = 'https://hitchcoxaesthetics.com/resources/blvd-webhook'

async function main() {
	const args = process.argv.slice(2)
	const url =
		args.find(a => a.startsWith('--url='))?.slice('--url='.length) ?? DEFAULT_URL
	const ping = args.includes('--ping')

	const existing = await boulevardAdminFetch<{
		webhooks?: {
			edges?: Array<{
				node?: {
					id?: string
					name?: string
					url?: string
					subscriptions?: Array<{ eventType?: string; enabled?: boolean }>
				} | null
			}>
		}
	}>(
		`query { webhooks(first: 50) { edges { node { id name url subscriptions { eventType enabled } } } } }`,
	)
	const nodes = (existing.webhooks?.edges ?? [])
		.map(e => e.node)
		.filter(Boolean)
	for (const n of nodes)
		console.log(
			`existing: ${n!.id} ${n!.name} -> ${n!.url} [${(n!.subscriptions ?? [])
				.map(s => s.eventType)
				.join(', ')}]`,
		)

	let hook = nodes.find(n => n!.url === url) ?? null
	if (!hook) {
		const created = await boulevardAdminFetch<{
			createWebhook?: { webhook?: { id?: string; url?: string } }
		}>(
			`mutation Create($input: CreateWebhookInput!) {
				createWebhook(input: $input) { webhook { id url } }
			}`,
			{
				input: {
					name: 'Review reminder (checkout texts)',
					url,
					subscriptions: [{ eventType: 'APPOINTMENT_COMPLETED' }],
				},
			},
		)
		hook = created.createWebhook?.webhook ?? null
		console.log('created:', hook?.id, '->', hook?.url)
	} else {
		console.log('already registered:', hook.id)
	}

	if (ping && hook?.id) {
		const res = await boulevardAdminFetch<{ pingWebhook?: unknown }>(
			`mutation Ping($input: PingWebhookInput!) { pingWebhook(input: $input) { clientMutationId } }`,
			{ input: { webhookId: hook.id } },
		)
		console.log('ping sent:', JSON.stringify(res))
	}
}

main().catch(e => {
	console.error(e instanceof Error ? e.message : e)
	process.exit(1)
})
