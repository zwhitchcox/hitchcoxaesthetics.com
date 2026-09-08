import { useNavigate } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '#app/components/ui/icon.tsx'
import {
	AI_CHAT_GREETING,
	AI_CHAT_MAX_MESSAGE_CHARS,
	AI_CHAT_OFFICE_PHONE,
	type AiChatAction,
} from '#app/utils/ai-chat.ts'
import { getMarketingPageEventProperties } from '#app/utils/booking-analytics.ts'
import { usePostHog } from '#app/utils/posthog.tsx'

/**
 * Floating "AI chat" bubble + panel for the marketing site. Talks only to
 * our own /resources/ai-chat proxy (no external scripts, no exposed keys).
 * Sits above the fixed bottom CTA bar (h-[3.2rem] z-50), hence the 4.25rem
 * bottom offset. Renders nothing unless window.ENV.AI_CHAT_ENABLED === 'true',
 * so shipping the code is inert until the flag is set on Fly.
 */

type ChatMessage = {
	role: 'assistant' | 'user'
	text: string
}

const FETCH_FAILED_MESSAGE = `Sorry, I couldn't send that. Please try again, or call our office at ${AI_CHAT_OFFICE_PHONE}.`

export function AiChat() {
	const [enabled, setEnabled] = useState(false)
	useEffect(() => {
		setEnabled(window.ENV?.AI_CHAT_ENABLED === 'true')
	}, [])
	if (!enabled) return null
	return <AiChatWidget />
}

function AiChatWidget() {
	const navigate = useNavigate()
	const posthog = usePostHog()
	const [open, setOpen] = useState(false)
	const [chatId, setChatId] = useState<string | null>(null)
	const [messages, setMessages] = useState<ChatMessage[]>([
		{ role: 'assistant', text: AI_CHAT_GREETING },
	])
	const [input, setInput] = useState('')
	const [sending, setSending] = useState(false)
	const scrollRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	// Serves as the sent-message counter for analytics without extra state.
	const sentCount = messages.filter(message => message.role === 'user').length

	useEffect(() => {
		if (!open) return
		const el = scrollRef.current
		if (el) el.scrollTop = el.scrollHeight
	}, [messages, sending, open])

	function baseEventProperties() {
		return getMarketingPageEventProperties({
			pathname: window.location.pathname,
			search: window.location.search,
		})
	}

	function handleOpenToggle() {
		const next = !open
		setOpen(next)
		if (next) {
			posthog?.capture('ai_chat_opened', baseEventProperties())
			setTimeout(() => inputRef.current?.focus(), 50)
		}
	}

	function performAction(action: AiChatAction) {
		if (action.type === 'navigate') {
			posthog?.capture('ai_chat_navigated', {
				...baseEventProperties(),
				chat_id: chatId ?? undefined,
				chat_target_path: action.path,
			})
			navigate(action.path)
			return
		}
		posthog?.capture('ai_chat_booking_handoff', {
			...baseEventProperties(),
			chat_id: chatId ?? undefined,
			chat_service_slug: action.serviceSlug,
		})
		navigate(`/book?service=${encodeURIComponent(action.serviceSlug)}`)
	}

	async function handleSend(event: React.FormEvent) {
		event.preventDefault()
		const message = input.trim()
		if (!message || sending) return

		setInput('')
		setSending(true)
		setMessages(current => [...current, { role: 'user', text: message }])
		posthog?.capture('ai_chat_message_sent', {
			...baseEventProperties(),
			chat_id: chatId ?? undefined,
			chat_message_length: message.length,
			chat_turn_count: sentCount + 1,
		})

		try {
			const response = await fetch('/resources/ai-chat', {
				body: JSON.stringify({ chatId, message }),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST',
			})
			if (!response.ok) throw new Error(`AI chat HTTP ${response.status}`)
			const data = (await response.json()) as {
				action: AiChatAction | null
				chatId: string | null
				message: string
			}
			if (data.chatId) setChatId(data.chatId)
			setMessages(current => [
				...current,
				{ role: 'assistant', text: data.message },
			])
			if (data.action) performAction(data.action)
		} catch {
			setMessages(current => [
				...current,
				{ role: 'assistant', text: FETCH_FAILED_MESSAGE },
			])
		} finally {
			setSending(false)
		}
	}

	return (
		<>
			{open ? (
				<div
					className="fixed bottom-[4.25rem] left-2 right-2 z-[55] flex h-[70dvh] max-h-[34rem] flex-col overflow-hidden rounded-xl border border-gray-300 bg-background shadow-2xl sm:left-auto sm:right-4 sm:w-96"
					role="dialog"
					aria-label="AI chat with Sarah Hitchcox Aesthetics"
				>
					<div className="flex items-center justify-between bg-black px-4 py-3 text-white">
						<div>
							<p className="text-sm font-semibold">AI chat</p>
							<p className="text-xs text-gray-300">
								Automated assistant, not a human
							</p>
						</div>
						<button
							type="button"
							onClick={() => setOpen(false)}
							aria-label="Close AI chat"
							className="rounded p-1 hover:bg-gray-800"
						>
							<Icon name="x" className="h-5 w-5" />
						</button>
					</div>
					<div
						ref={scrollRef}
						className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
					>
						{messages.map((message, index) => (
							<div
								key={index}
								className={
									message.role === 'user'
										? 'ml-8 rounded-lg rounded-br-sm bg-black px-3 py-2 text-sm text-white'
										: 'mr-8 whitespace-pre-wrap rounded-lg rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground'
								}
							>
								{message.text}
							</div>
						))}
						{sending ? (
							<div className="mr-8 rounded-lg rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
								Typing...
							</div>
						) : null}
					</div>
					<form
						onSubmit={handleSend}
						className="flex items-center gap-2 border-t border-gray-200 p-2"
					>
						<input
							ref={inputRef}
							value={input}
							onChange={event => setInput(event.target.value)}
							maxLength={AI_CHAT_MAX_MESSAGE_CHARS}
							placeholder="Ask about our services..."
							aria-label="Message the AI assistant"
							className="min-w-0 flex-1 rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
						/>
						<button
							type="submit"
							disabled={sending || !input.trim()}
							className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
						>
							Send
						</button>
					</form>
				</div>
			) : (
				<button
					type="button"
					onClick={handleOpenToggle}
					aria-label="Open AI chat"
					className="fixed bottom-[4.25rem] right-3 z-[55] flex items-center gap-2 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-gray-800"
				>
					<Icon name="chat-bubble" className="h-5 w-5" />
					AI chat
				</button>
			)}
		</>
	)
}
