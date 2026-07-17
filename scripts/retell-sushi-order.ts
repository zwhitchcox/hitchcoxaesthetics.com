/**
 * Retell outbound sushi-ordering agent — places a pickup order at Nama Sushi
 * Bar (Bearden) by phone. Creates/updates a dedicated agent with the order
 * baked into the prompt, then places the call.
 *
 *   pnpm tsx scripts/retell-sushi-order.ts --to=+18652101404          # practice call (your phone)
 *   pnpm tsx scripts/retell-sushi-order.ts --to=+18659884539 --real   # the real restaurant call
 *
 * Practice mode (default) tells the agent it may be talking to Zane pretending
 * to be the restaurant; --real drops that framing. The order lives in ORDER
 * below — edit there.
 */
import 'dotenv/config'

const BASE = 'https://api.retellai.com'
const FROM_NUMBER = '+18653389694' // spare Retell number (not the SHA line)
const AGENT_NAME = 'Sushi Order - Nama Bearden'
const VOICE = 'openai-Cimo' // same voice as the booking agents

const ORDER = [
	'2 Atlantic Rolls',
	'1 Mango Sake',
	'1 Yellowtail Sashimi',
	'1 Crunchy Shrimp Roll',
	'1 order of Veggie Spring Rolls',
]

const CUSTOMER = {
	name: 'Zane',
	callback: '865-210-1404',
}

function flag(name: string) {
	const p = `--${name}=`
	return process.argv.find(a => a.startsWith(p))?.slice(p.length)
}
const TO = flag('to') ?? '+18652101404'
const REAL = process.argv.includes('--real')

function buildPrompt() {
	return [
		`You are Alex. You are ON A LIVE PHONE CALL RIGHT NOW with Nama Sushi Bar's Bearden location in Knoxville, Tennessee, placing a PICKUP order on behalf of ${CUSTOMER.name}.`,
		'CRITICAL: You are the caller, not a coach. Never explain what you are doing, never describe "the flow", never give instructions or meta-commentary. Every word you say is spoken directly to the restaurant employee. Only ever speak as the customer placing this order.',
		'',
		'## The order (read naturally, not like a list dump)',
		...ORDER.map(i => `- ${i}`),
		'',
		'## How to run the call',
		`- You have ALREADY said "Hi! I'd like to place a pickup order, please." as your opening line. When they respond, read the WHOLE order in one go, with a brief natural pause between each line item so they can write it down: "Two Atlantic Rolls... [pause] ...one Mango Sake... [pause] ...one Yellowtail Sashimi..." and so on. Keep each quantity glued to its item, speak at dictation speed, and do NOT stop to wait for acknowledgment between items — only pause. If they interrupt to catch up, stop, let them, then continue where you left off.`,
		`- Name for the order: ${CUSTOMER.name}. Callback number if asked: ${CUSTOMER.callback}. Payment: will pay at pickup.`,
		'- Confirm every item got down correctly. If they read the order back, verify it matches exactly.',
		'- If an item is unavailable or they do not recognize it, do NOT improvise a substitute. Skip it, and remember to report it.',
		'- The Mango Sake is a drink; if they cannot sell it for pickup, just drop it politely.',
		'- After reading the order, ask them to confirm they got everything — just that, nothing else in the same breath.',
		'- Before hanging up, ALWAYS get the total price and the estimated pickup time (ask as its own short question).',
		`- Close with a thank-you and confirm the pickup name (${CUSTOMER.name}) one more time.`,
		'- Keep responses short and natural. One question at a time. Never talk over them.',
		'- If you reach a voicemail, leave no message and end the call.',
		...(REAL
			? []
			: [
					'',
					'## Practice note',
					`This is a PRACTICE run: the person answering is likely ${CUSTOMER.name} pretending to be the restaurant. Play it completely straight anyway — run the call exactly as if it were the real restaurant.`,
				]),
	].join('\n')
}

async function api(path: string, method = 'GET', body?: unknown) {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	})
	const json: any = await res.json().catch(() => ({}))
	if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
	return json
}

async function main() {
	if (!process.env.RETELL_API_KEY) throw new Error('RETELL_API_KEY required')

	// Find or create the agent (and its LLM), then push the current prompt.
	const agents: any[] = await api('/list-agents')
	let agent = agents.find(a => a.agent_name === AGENT_NAME)
	if (agent) {
		const llmId = agent.response_engine?.llm_id
		if (!llmId) throw new Error('existing agent has no retell-llm response engine')
		await api(`/update-retell-llm/${llmId}`, 'PATCH', {
			general_prompt: buildPrompt(),
			// canned opener plays INSTANTLY on pickup (text models have first-turn latency)
			begin_message: "Hi! I'd like to place a pickup order, please.",
			s2s_model: null, // s2s_model and model are mutually exclusive
			model: 'gpt-5.5',
		})
		console.log(`✓ updated agent ${agent.agent_id} (${REAL ? 'real' : 'practice'} prompt)`)
	} else {
		const llm = await api('/create-retell-llm', 'POST', {
			general_prompt: buildPrompt(),
			begin_message: "Hi! I'd like to place a pickup order, please.",
			model: 'gpt-5.5',
		})
		agent = await api('/create-agent', 'POST', {
			agent_name: AGENT_NAME,
			voice_id: VOICE,
			response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
			language: 'en-US',
		})
		console.log(`✓ created agent ${agent.agent_id} (llm ${llm.llm_id})`)
	}

	console.log(`Calling ${TO} from ${FROM_NUMBER} (${REAL ? 'REAL ORDER' : 'practice'})...`)
	const call = await api('/v2/create-phone-call', 'POST', {
		from_number: FROM_NUMBER,
		to_number: TO,
		override_agent_id: agent.agent_id,
	})
	console.log(`✓ call placed: ${call.call_id} (status: ${call.call_status})`)
	console.log(`  transcript later: https://dashboard.retellai.com/ or GET /v2/get-call/${call.call_id}`)
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
