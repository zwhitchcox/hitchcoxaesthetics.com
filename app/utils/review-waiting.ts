/**
 * The sentence Sarah reads about her queue, on the review page and in the
 * reminder texts. One source, so the number in the text is the number on
 * the page. Browser safe.
 */

export const REVIEW_LINK = 'hitchcoxaesthetics.com/review'

/** How many characters of a title fit in a text. */
const TITLE_MAX = 80

export type WaitingCounts = {
	articles: number
	questions: number
	/** The title (or the question) when there is exactly one item in total. */
	onlyTitle?: string | null
}

/** Cut at a word boundary, never mid-word, with an ellipsis. */
export function cutAtWord(text: string, max = TITLE_MAX): string {
	const t = text.trim().replace(/\s+/g, ' ')
	if (t.length <= max) return t
	const cut = t.slice(0, max).replace(/\s+\S*$/, '')
	return `${cut.length >= max / 2 ? cut : t.slice(0, max)}…`
}

function count(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`
}

/**
 * '' when nothing waits. "1 article is waiting: <title>." for one article,
 * "1 question is waiting: <ask>." for one question, else the counts:
 * "3 articles and 2 questions are waiting."
 */
export function waitingSentence({
	articles,
	questions,
	onlyTitle,
}: WaitingCounts): string {
	const total = articles + questions
	if (total <= 0) return ''
	if (total === 1 && onlyTitle?.trim()) {
		const noun = articles === 1 ? 'article' : 'question'
		return `1 ${noun} is waiting: ${cutAtWord(onlyTitle).replace(/[.!?…]+$/, '')}.`
	}
	const parts: string[] = []
	if (articles > 0) parts.push(count(articles, 'article', 'articles'))
	if (questions > 0) parts.push(count(questions, 'question', 'questions'))
	return `${parts.join(' and ')} ${total === 1 ? 'is' : 'are'} waiting.`
}

/** The text message: the sentence and the link. '' when nothing waits. */
export function waitingText(w: WaitingCounts): string {
	const sentence = waitingSentence(w)
	return sentence ? `${sentence} ${REVIEW_LINK}` : ''
}
