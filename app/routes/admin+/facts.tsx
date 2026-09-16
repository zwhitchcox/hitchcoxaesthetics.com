import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { z } from 'zod'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'
import { saveFact } from '#app/utils/review-facts.server.ts'
import {
	FACT_ANSWER_MAX_CHARS,
	FACT_MAX_CHARS,
	FACT_QUESTION_MAX_CHARS,
	FACT_TAGS_MAX_CHARS,
	normaliseTags,
} from '#app/utils/review-facts.ts'

/**
 * The fact bank (review phase 5, R7): what Sarah has told us, one row per
 * fact. Grill and manual rows can be edited here. Docs rows come from the
 * markdown files in the pbn repo: the file is the truth, so they can be
 * retired here but not edited. Plain forms; the inputs of a row point at
 * the row's form with the `form` attribute.
 */

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const FACT_SELECT = {
	id: true,
	source: true,
	key: true,
	fact: true,
	tags: true,
	question: true,
	answer: true,
	articleId: true,
	article: { select: { title: true } },
	updatedAt: true,
	retiredAt: true,
} as const

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const rows = await prisma.reviewFact.findMany({
		orderBy: { updatedAt: 'desc' },
		select: FACT_SELECT,
	})
	return json({
		live: rows.filter(r => !r.retiredAt),
		retired: rows.filter(r => r.retiredAt),
	})
}

const idField = z.string().trim().min(1).max(64)
const factField = z.string().trim().min(1).max(FACT_MAX_CHARS)
const tagsField = z
	.string()
	.default('')
	.transform(normaliseTags)
	.refine(s => s.length <= FACT_TAGS_MAX_CHARS, {
		message: 'Tags are too long.',
	})
const answerField = z.string().trim().max(FACT_ANSWER_MAX_CHARS).default('')

const AddSchema = z.object({
	fact: factField,
	tags: tagsField,
	question: z.string().trim().max(FACT_QUESTION_MAX_CHARS).default(''),
	answer: answerField,
})

const EditSchema = z.object({
	id: idField,
	fact: factField,
	tags: tagsField,
	answer: answerField,
})

const IdSchema = z.object({ id: idField })

const COPY = {
	badFact: `Write the fact in 1 to ${FACT_MAX_CHARS} characters.`,
	notFound: 'That row is gone.',
	docsRow: 'A docs row comes from a file. Edit the file, not the row.',
	unknown: 'Unknown action.',
} as const

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserWithRole(request, 'admin')
	const form = Object.fromEntries(await request.formData())
	const bad = (error: string) => json({ error }, { status: 400 })

	switch (form.intent) {
		case 'add': {
			const parsed = AddSchema.safeParse(form)
			if (!parsed.success) return bad(COPY.badFact)
			await saveFact({ ...parsed.data, source: 'manual', userId })
			return json({ ok: true })
		}
		case 'edit': {
			const parsed = EditSchema.safeParse(form)
			if (!parsed.success) return bad(COPY.badFact)
			const { id, ...data } = parsed.data
			const row = await prisma.reviewFact.findUnique({
				where: { id },
				select: { source: true },
			})
			if (!row) return bad(COPY.notFound)
			if (row.source === 'docs') return bad(COPY.docsRow)
			await prisma.reviewFact.update({
				where: { id },
				data: { ...data, answer: data.answer || null, userId },
			})
			return json({ ok: true })
		}
		case 'retire':
		case 'restore': {
			const parsed = IdSchema.safeParse(form)
			if (!parsed.success) return bad(COPY.notFound)
			const changed = await prisma.reviewFact.updateMany({
				where: { id: parsed.data.id },
				data: { retiredAt: form.intent === 'retire' ? new Date() : null },
			})
			if (changed.count === 0) return bad(COPY.notFound)
			return json({ ok: true })
		}
		default:
			return bad(COPY.unknown)
	}
}

function when(iso: string) {
	return new Date(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

export default function FactsAdmin() {
	const { live, retired } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const busy = useNavigation().state !== 'idle'
	const error =
		actionData && 'error' in actionData ? String(actionData.error) : null

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold">Facts</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					What Sarah has told us. The writer and the chat read this list, so no
					question is asked twice. Rows from the docs come from the markdown
					files in the pbn repo: edit the file, not the row. You can retire a
					docs row here.
				</p>
			</div>

			{error ? (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
					{error}
				</div>
			) : null}

			<div className="rounded-lg border bg-card p-4 shadow">
				<h3 className="text-lg font-semibold">Add a fact</h3>
				<Form method="post" className="mt-2 flex flex-wrap items-center gap-2">
					<input type="hidden" name="intent" value="add" />
					<Input
						name="fact"
						placeholder="One sentence a writer can use"
						className="h-8 min-w-64 flex-1 text-sm"
						maxLength={FACT_MAX_CHARS}
						required
					/>
					<Input
						name="tags"
						placeholder="Tags: botox, pricing"
						className="h-8 w-44 text-sm"
					/>
					<Input
						name="question"
						placeholder="Question (optional)"
						className="h-8 w-56 text-sm"
					/>
					<Input
						name="answer"
						placeholder="Her answer (optional)"
						className="h-8 w-56 text-sm"
					/>
					<Button type="submit" size="sm" disabled={busy}>
						Add
					</Button>
				</Form>
			</div>

			<FactTable
				title={`Live (${live.length})`}
				rows={live}
				busy={busy}
				empty="No facts yet. A grill adds them, or add one above."
			/>
			<FactTable
				title={`Retired (${retired.length})`}
				rows={retired}
				busy={busy}
				empty="No retired facts."
			/>
		</div>
	)
}

type FactRow = ReturnType<typeof useLoaderData<typeof loader>>['live'][number]

function FactTable({
	title,
	rows,
	busy,
	empty,
}: {
	title: string
	rows: FactRow[]
	busy: boolean
	empty: string
}) {
	return (
		<div className="overflow-x-auto rounded-lg border bg-card shadow">
			<h3 className="px-3 pt-3 text-lg font-semibold">{title}</h3>
			<table className="mt-2 w-full text-sm">
				<thead>
					<tr className="border-b bg-muted/50 text-left">
						<th className="px-3 py-2">Fact</th>
						<th className="px-3 py-2">Tags</th>
						<th className="px-3 py-2">Question</th>
						<th className="px-3 py-2">Answer</th>
						<th className="px-3 py-2">Source</th>
						<th className="px-3 py-2">From</th>
						<th className="px-3 py-2">When</th>
						<th className="px-3 py-2">
							<span className="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td
								colSpan={8}
								className="px-3 py-6 text-center text-muted-foreground"
							>
								{empty}
							</td>
						</tr>
					) : null}
					{rows.map(row => (
						<FactTableRow key={row.id} row={row} busy={busy} />
					))}
				</tbody>
			</table>
		</div>
	)
}

function FactTableRow({ row, busy }: { row: FactRow; busy: boolean }) {
	const editable = row.source !== 'docs' && !row.retiredAt
	const formId = `edit-${row.id}`
	return (
		<tr className="border-b align-top">
			<td className="min-w-64 px-3 py-2">
				{editable ? (
					<Input
						form={formId}
						name="fact"
						defaultValue={row.fact}
						className="h-8 text-sm"
						maxLength={FACT_MAX_CHARS}
						required
					/>
				) : (
					row.fact
				)}
			</td>
			<td className="px-3 py-2">
				{editable ? (
					<Input
						form={formId}
						name="tags"
						defaultValue={row.tags}
						className="h-8 w-40 text-sm"
					/>
				) : (
					row.tags || '-'
				)}
			</td>
			<td className="max-w-xs px-3 py-2 text-muted-foreground">
				{row.question || '-'}
			</td>
			<td className="px-3 py-2">
				{editable ? (
					<Input
						form={formId}
						name="answer"
						defaultValue={row.answer ?? ''}
						className="h-8 w-48 text-sm"
					/>
				) : (
					row.answer || '-'
				)}
			</td>
			<td className="px-3 py-2">
				<span title={row.key ?? undefined}>{row.source}</span>
			</td>
			<td className="max-w-xs px-3 py-2 text-muted-foreground">
				{row.articleId ? (
					<Link to={`/admin/articles/${row.articleId}`} className="underline">
						{row.article?.title ?? 'article'}
					</Link>
				) : (
					'-'
				)}
			</td>
			<td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
				{when(row.updatedAt)}
			</td>
			<td className="whitespace-nowrap px-3 py-2">
				<div className="flex items-center gap-1">
					{editable ? (
						<Form id={formId} method="post">
							<input type="hidden" name="intent" value="edit" />
							<input type="hidden" name="id" value={row.id} />
							<Button type="submit" size="sm" variant="outline" disabled={busy}>
								Save
							</Button>
						</Form>
					) : null}
					<Form method="post">
						<input
							type="hidden"
							name="intent"
							value={row.retiredAt ? 'restore' : 'retire'}
						/>
						<input type="hidden" name="id" value={row.id} />
						<Button type="submit" size="sm" variant="ghost" disabled={busy}>
							{row.retiredAt ? 'Restore' : 'Retire'}
						</Button>
					</Form>
				</div>
			</td>
		</tr>
	)
}
