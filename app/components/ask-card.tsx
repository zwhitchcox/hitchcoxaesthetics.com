/**
 * One open question for Sarah from the outreach ledger, on the /review home
 * page (phase 6, A5): where it comes from, the ask, how long it takes, the
 * details behind a disclosure, and a box she types or dictates her answer
 * into. The form posts intent "answer" with the ask's id to the page's
 * action. Spoken words show as grey ghost text and join the typed words
 * when she stops, as the note boxes on the article page do.
 */
import { Form } from '@remix-run/react'
import { useState } from 'react'
import {
	DictateButton,
	DictationNote,
	GhostTextarea,
	useDictation,
} from '#app/components/dictation.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { appendSpeech } from '#app/utils/article-edit.ts'
import { effortWords, type AskFile } from '#app/utils/review-asks.ts'

export const ASK_CARD_COPY = {
	heading: 'Questions for you',
	details: 'Details',
	answerLabel: 'Your answer',
	placeholder: 'Answer here',
	send: 'Send',
	sent: 'Sent to the team.',
	empty: 'Say something first.',
} as const

export type AskCardAsk = {
	id: string
	domain: string
	ask: string
	effort: string | null
	about: string | null
	standing: string | null
	files: AskFile[]
}

export function AskCard({
	ask,
	error = null,
	busy = false,
}: {
	ask: AskCardAsk
	/** The action's refusal for this card ("Say something first."). */
	error?: string | null
	/** A submit is in flight: the buttons are off. */
	busy?: boolean
}) {
	const [value, setValue] = useState('')
	const [ghost, setGhost] = useState('')
	const dictation = useDictation({
		onInterim: setGhost,
		onFinal: text => {
			setGhost('')
			setValue(current => appendSpeech(current, text))
		},
	})
	const effort = effortWords(ask.effort)
	const hasDetails = Boolean(ask.about || ask.standing || ask.files.length)
	return (
		<li className="rounded-xl border bg-card p-4 shadow-sm">
			<Form method="post" className="space-y-3">
				<input type="hidden" name="intent" value="answer" />
				<input type="hidden" name="askId" value={ask.id} />
				<div>
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{ask.domain}
					</p>
					<p className="mt-1 text-base leading-snug">{ask.ask}</p>
					{effort ? (
						<p className="mt-1 text-sm text-muted-foreground">{effort}</p>
					) : null}
				</div>
				{hasDetails ? (
					<details className="text-sm">
						<summary className="cursor-pointer font-medium text-primary">
							{ASK_CARD_COPY.details}
						</summary>
						<div className="mt-2 space-y-3 text-muted-foreground">
							{ask.about ? (
								<p className="whitespace-pre-wrap">{ask.about}</p>
							) : null}
							{ask.standing ? (
								<p className="whitespace-pre-wrap">{ask.standing}</p>
							) : null}
							{ask.files.map((file, index) => (
								<div key={`${index}-${file.name}`}>
									<p className="font-medium text-foreground">{file.name}</p>
									<pre className="whitespace-pre-wrap">{file.text}</pre>
								</div>
							))}
						</div>
					</details>
				) : null}
				<GhostTextarea
					id={`ask-${ask.id}-answer`}
					name="answer"
					aria-label={ASK_CARD_COPY.answerLabel}
					placeholder={ASK_CARD_COPY.placeholder}
					value={value}
					ghost={ghost}
					listening={dictation.listening}
					onChange={event => setValue(event.currentTarget.value)}
					rows={3}
					className="text-base placeholder:text-muted-foreground"
				/>
				<DictationNote dictation={dictation} />
				{error ? (
					<p role="alert" className="text-sm text-red-700 dark:text-red-300">
						{error}
					</p>
				) : null}
				<div className="flex items-center gap-2">
					<DictateButton dictation={dictation} disabled={busy} />
					<Button
						type="submit"
						size="lg"
						className="flex-1 text-base"
						disabled={busy || dictation.listening}
					>
						{ASK_CARD_COPY.send}
					</Button>
				</div>
			</Form>
		</li>
	)
}
