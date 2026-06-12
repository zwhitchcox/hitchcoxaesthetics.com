import { type SEOHandle } from '@nasa-gcn/remix-seo'
import {
	json,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useLoaderData, useNavigation } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { ensureCallTagDefaults } from '#app/utils/call-tags.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	await ensureCallTagDefaults()
	const groups = await prisma.callTagGroup.findMany({
		orderBy: { order: 'asc' },
		select: {
			id: true,
			name: true,
			description: true,
			exclusive: true,
			active: true,
			tags: {
				orderBy: { order: 'asc' },
				select: {
					id: true,
					value: true,
					description: true,
					active: true,
				},
			},
		},
	})
	return json({ groups })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const intent = formData.get('intent')

	switch (intent) {
		case 'add-tag': {
			const groupId = String(formData.get('groupId') ?? '')
			const value = slugify(String(formData.get('value') ?? ''))
			const description = optionalText(formData.get('description'))
			if (!groupId || !value) {
				return json({ error: 'Tag value is required.' }, { status: 400 })
			}
			const last = await prisma.callTag.findFirst({
				where: { groupId },
				orderBy: { order: 'desc' },
				select: { order: true },
			})
			await prisma.callTag.upsert({
				where: { groupId_value: { groupId, value } },
				create: { groupId, value, description, order: (last?.order ?? 0) + 1 },
				update: { active: true, description: description ?? undefined },
			})
			return json({ ok: true })
		}
		case 'update-tag': {
			const tagId = String(formData.get('tagId') ?? '')
			const description = optionalText(formData.get('description'))
			if (!tagId) return json({ error: 'Missing tag.' }, { status: 400 })
			await prisma.callTag.update({
				where: { id: tagId },
				data: { description },
			})
			return json({ ok: true })
		}
		case 'toggle-tag': {
			const tagId = String(formData.get('tagId') ?? '')
			const active = formData.get('active') === 'true'
			if (!tagId) return json({ error: 'Missing tag.' }, { status: 400 })
			await prisma.callTag.update({ where: { id: tagId }, data: { active } })
			return json({ ok: true })
		}
		case 'delete-tag': {
			const tagId = String(formData.get('tagId') ?? '')
			if (!tagId) return json({ error: 'Missing tag.' }, { status: 400 })
			await prisma.callTag.delete({ where: { id: tagId } })
			return json({ ok: true })
		}
		case 'add-group': {
			const name = slugify(String(formData.get('name') ?? ''))
			const description = optionalText(formData.get('description'))
			const exclusive = formData.get('exclusive') === 'on'
			if (!name) {
				return json({ error: 'Group name is required.' }, { status: 400 })
			}
			const last = await prisma.callTagGroup.findFirst({
				orderBy: { order: 'desc' },
				select: { order: true },
			})
			await prisma.callTagGroup.upsert({
				where: { name },
				create: {
					name,
					description,
					exclusive,
					order: (last?.order ?? 0) + 1,
				},
				update: { active: true },
			})
			return json({ ok: true })
		}
		case 'update-group': {
			const groupId = String(formData.get('groupId') ?? '')
			const description = optionalText(formData.get('description'))
			const exclusive = formData.get('exclusive') === 'on'
			if (!groupId) return json({ error: 'Missing group.' }, { status: 400 })
			await prisma.callTagGroup.update({
				where: { id: groupId },
				data: { description, exclusive },
			})
			return json({ ok: true })
		}
		case 'toggle-group': {
			const groupId = String(formData.get('groupId') ?? '')
			const active = formData.get('active') === 'true'
			if (!groupId) return json({ error: 'Missing group.' }, { status: 400 })
			await prisma.callTagGroup.update({
				where: { id: groupId },
				data: { active },
			})
			return json({ ok: true })
		}
		case 'delete-group': {
			const groupId = String(formData.get('groupId') ?? '')
			if (!groupId) return json({ error: 'Missing group.' }, { status: 400 })
			await prisma.callTagGroup.delete({ where: { id: groupId } })
			return json({ ok: true })
		}
		default:
			return json({ error: 'Unknown intent.' }, { status: 400 })
	}
}

function slugify(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
}

function optionalText(value: FormDataEntryValue | null) {
	const text = typeof value === 'string' ? value.trim() : ''
	return text || null
}

export default function CallTagsAdmin() {
	const { groups } = useLoaderData<typeof loader>()
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold">Call Tags</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					The AI call analyzer tags every analyzed phone call using these
					groups. Exclusive groups force exactly one choice (like an outcome);
					non-exclusive groups allow any number. Changes apply to the next
					analysis run. Defaults live in code (
					<code className="rounded bg-muted px-1">
						app/utils/call-tags.server.ts
					</code>
					) and are re-added here if missing, so deactivate rather than delete a
					default you want gone.
				</p>
			</div>

			{groups.map(group => (
				<div
					key={group.id}
					className={`rounded-lg border bg-card p-4 shadow ${group.active ? '' : 'opacity-60'}`}
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<h3 className="font-mono text-lg font-semibold">{group.name}</h3>
							<span className="rounded-full bg-muted px-2 py-0.5 text-xs">
								{group.exclusive ? 'pick one' : 'pick many'}
							</span>
							{!group.active ? (
								<span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
									inactive
								</span>
							) : null}
						</div>
						<div className="flex items-center gap-2">
							<Form method="post">
								<input type="hidden" name="intent" value="toggle-group" />
								<input type="hidden" name="groupId" value={group.id} />
								<input
									type="hidden"
									name="active"
									value={String(!group.active)}
								/>
								<Button
									type="submit"
									variant="outline"
									size="sm"
									disabled={busy}
								>
									{group.active ? 'Deactivate' : 'Activate'}
								</Button>
							</Form>
							<Form
								method="post"
								onSubmit={event => {
									if (!confirm(`Delete group "${group.name}" and its tags?`)) {
										event.preventDefault()
									}
								}}
							>
								<input type="hidden" name="intent" value="delete-group" />
								<input type="hidden" name="groupId" value={group.id} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									disabled={busy}
									aria-label={`Delete group ${group.name}`}
								>
									<Icon name="trash" className="h-4 w-4" />
								</Button>
							</Form>
						</div>
					</div>

					<Form
						method="post"
						className="mt-3 flex flex-wrap items-center gap-2"
					>
						<input type="hidden" name="intent" value="update-group" />
						<input type="hidden" name="groupId" value={group.id} />
						<Input
							name="description"
							defaultValue={group.description ?? ''}
							placeholder="What this group means (shown to the AI)"
							className="h-8 max-w-xl flex-1 text-sm"
						/>
						<label className="flex items-center gap-1.5 text-sm">
							<input
								type="checkbox"
								name="exclusive"
								defaultChecked={group.exclusive}
							/>
							exclusive
						</label>
						<Button type="submit" variant="outline" size="sm" disabled={busy}>
							Save
						</Button>
					</Form>

					<ul className="mt-3 divide-y">
						{group.tags.map(tag => (
							<li
								key={tag.id}
								className={`flex flex-wrap items-center gap-2 py-2 ${tag.active ? '' : 'opacity-50'}`}
							>
								<code className="min-w-44 rounded bg-muted px-2 py-1 text-sm">
									{tag.value}
								</code>
								<Form method="post" className="flex flex-1 items-center gap-2">
									<input type="hidden" name="intent" value="update-tag" />
									<input type="hidden" name="tagId" value={tag.id} />
									<Input
										name="description"
										defaultValue={tag.description ?? ''}
										placeholder="Hint for the AI (optional)"
										className="h-8 flex-1 text-sm"
									/>
									<Button
										type="submit"
										variant="outline"
										size="sm"
										disabled={busy}
									>
										Save
									</Button>
								</Form>
								<Form method="post">
									<input type="hidden" name="intent" value="toggle-tag" />
									<input type="hidden" name="tagId" value={tag.id} />
									<input
										type="hidden"
										name="active"
										value={String(!tag.active)}
									/>
									<Button
										type="submit"
										variant="ghost"
										size="sm"
										disabled={busy}
									>
										{tag.active ? 'Deactivate' : 'Activate'}
									</Button>
								</Form>
								<Form
									method="post"
									onSubmit={event => {
										if (!confirm(`Delete tag "${tag.value}"?`)) {
											event.preventDefault()
										}
									}}
								>
									<input type="hidden" name="intent" value="delete-tag" />
									<input type="hidden" name="tagId" value={tag.id} />
									<Button
										type="submit"
										variant="ghost"
										size="sm"
										disabled={busy}
										aria-label={`Delete tag ${tag.value}`}
									>
										<Icon name="trash" className="h-4 w-4" />
									</Button>
								</Form>
							</li>
						))}
					</ul>

					<Form
						method="post"
						className="mt-2 flex flex-wrap items-center gap-2"
					>
						<input type="hidden" name="intent" value="add-tag" />
						<input type="hidden" name="groupId" value={group.id} />
						<Input
							name="value"
							placeholder="new_tag_value"
							className="h-8 w-48 font-mono text-sm"
							required
						/>
						<Input
							name="description"
							placeholder="Hint for the AI (optional)"
							className="h-8 max-w-md flex-1 text-sm"
						/>
						<Button type="submit" size="sm" disabled={busy}>
							Add tag
						</Button>
					</Form>
				</div>
			))}

			<div className="rounded-lg border bg-card p-4 shadow">
				<h3 className="text-lg font-semibold">New group</h3>
				<Form method="post" className="mt-2 flex flex-wrap items-center gap-2">
					<input type="hidden" name="intent" value="add-group" />
					<Input
						name="name"
						placeholder="group_name"
						className="h-8 w-48 font-mono text-sm"
						required
					/>
					<Input
						name="description"
						placeholder="What this group means (shown to the AI)"
						className="h-8 max-w-md flex-1 text-sm"
					/>
					<label className="flex items-center gap-1.5 text-sm">
						<input type="checkbox" name="exclusive" />
						exclusive
					</label>
					<Button type="submit" size="sm" disabled={busy}>
						Add group
					</Button>
				</Form>
			</div>
		</div>
	)
}
