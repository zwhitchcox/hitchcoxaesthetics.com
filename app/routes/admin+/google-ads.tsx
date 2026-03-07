import {
	json,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import * as fs from 'fs'
import * as path from 'path'
import { useLoaderData, useFetcher, useActionData } from '@remix-run/react'
import { useState, useEffect } from 'react'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { toast } from 'sonner'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const ADS_DIR = path.join(process.cwd(), 'google-ads')

function getYamlFiles(
	dir: string,
): { relativePath: string; content: string }[] {
	let results: { relativePath: string; content: string }[] = []
	try {
		const list = fs.readdirSync(dir)
		for (const file of list) {
			if (file === 'scripts' || file === 'node_modules' || file === '.git')
				continue
			const fullPath = path.join(dir, file)
			const stat = fs.statSync(fullPath)
			if (stat.isDirectory()) {
				results = results.concat(getYamlFiles(fullPath))
			} else if (file.endsWith('.yaml') || file.endsWith('.md')) {
				results.push({
					relativePath: path.relative(ADS_DIR, fullPath),
					content: fs.readFileSync(fullPath, 'utf8'),
				})
			}
		}
	} catch (e) {
		console.error(e)
	}
	return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const files = getYamlFiles(ADS_DIR)
	return json({ files })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'save') {
		const filePath = formData.get('filePath') as string
		const content = formData.get('content') as string

		if (!filePath || typeof content !== 'string') {
			return json(
				{ status: 'error', message: 'Missing file path or content' } as const,
				{ status: 400 },
			)
		}

		const fullPath = path.join(ADS_DIR, filePath)

		// Security check to ensure the path stays within ADS_DIR
		if (
			!fullPath.startsWith(ADS_DIR) ||
			!(fullPath.endsWith('.yaml') || fullPath.endsWith('.md'))
		) {
			return json({ status: 'error', message: 'Invalid file path' } as const, {
				status: 400,
			})
		}

		try {
			fs.writeFileSync(fullPath, content, 'utf8')
			return json({ status: 'success', message: `Saved ${filePath}` } as const)
		} catch (e: any) {
			return json({ status: 'error', message: e.message } as const, {
				status: 500,
			})
		}
	}

	if (intent === 'sync') {
		try {
			const { stdout, stderr } = await execAsync(
				'node google-ads/scripts/sync.js',
				{
					cwd: process.cwd(),
				},
			)
			const output = stdout + (stderr ? '\nErrors:\n' + stderr : '')
			return json({
				status: 'success',
				message: 'Sync completed successfully',
				output,
			} as const)
		} catch (e: any) {
			const output = e.stdout + '\n' + e.stderr + '\n' + e.message
			return json(
				{ status: 'error', message: 'Sync failed', output } as const,
				{ status: 500 },
			)
		}
	}

	return json({ status: 'error', message: 'Invalid intent' } as const, {
		status: 400,
	})
}

export default function GoogleAdsAdmin() {
	const { files } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const fetcher = useFetcher<typeof action>()
	const [selectedFile, setSelectedFile] = useState<string | null>(
		files[0]?.relativePath || null,
	)
	const [content, setContent] = useState<string>('')

	const activeFile = files.find(f => f.relativePath === selectedFile)

	useEffect(() => {
		if (activeFile) {
			setContent(activeFile.content)
		}
	}, [selectedFile, activeFile])

	useEffect(() => {
		if (actionData?.status === 'success') {
			toast.success(actionData.message)
		} else if (actionData?.status === 'error') {
			toast.error(actionData.message)
		}
		if (fetcher.data?.status === 'success') {
			toast.success(fetcher.data.message)
		} else if (fetcher.data?.status === 'error') {
			toast.error(fetcher.data.message)
		}
	}, [actionData, fetcher.data])

	const isSaving =
		fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'save'
	const isSyncing =
		fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'sync'

	return (
		<div className="flex h-[calc(100vh-12rem)] gap-6">
			<div className="flex w-1/3 flex-col gap-4 overflow-hidden rounded-md border bg-card p-4 shadow-sm">
				<div className="flex items-center justify-between">
					<h2 className="text-xl font-semibold">Ad Configurations</h2>
					<fetcher.Form method="post">
						<input type="hidden" name="intent" value="sync" />
						<StatusButton
							type="submit"
							status={
								isSyncing
									? 'pending'
									: fetcher.data && fetcher.formData?.get('intent') === 'sync'
										? fetcher.data.status
										: 'idle'
							}
							variant="secondary"
							size="sm"
						>
							<Icon name="update" className="mr-2 h-4 w-4" />
							Run Sync
						</StatusButton>
					</fetcher.Form>
				</div>

				<div className="flex-1 overflow-y-auto">
					<ul className="space-y-1">
						{files.map(file => (
							<li key={file.relativePath}>
								<button
									onClick={() => setSelectedFile(file.relativePath)}
									className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
										selectedFile === file.relativePath
											? 'bg-primary text-primary-foreground'
											: 'hover:bg-muted'
									}`}
								>
									{file.relativePath}
								</button>
							</li>
						))}
					</ul>
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-4 overflow-hidden rounded-md border bg-card p-4 shadow-sm">
				{selectedFile ? (
					<fetcher.Form method="post" className="flex h-full flex-col gap-4">
						<div className="flex items-center justify-between">
							<h2 className="text-xl font-semibold">{selectedFile}</h2>
							<input type="hidden" name="intent" value="save" />
							<input type="hidden" name="filePath" value={selectedFile} />
							<StatusButton
								type="submit"
								status={
									isSaving
										? 'pending'
										: fetcher.data && fetcher.formData?.get('intent') === 'save'
											? fetcher.data.status
											: 'idle'
								}
								size="sm"
							>
								<Icon name="check" className="mr-2 h-4 w-4" />
								Save Changes
							</StatusButton>
						</div>
						<Textarea
							name="content"
							value={content}
							onChange={e => setContent(e.target.value)}
							className="flex-1 resize-none whitespace-pre font-mono text-sm"
							spellCheck={false}
						/>
					</fetcher.Form>
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground">
						Select a file to edit
					</div>
				)}
			</div>

			{(actionData && 'output' in actionData && actionData.output) ||
			(fetcher.data && 'output' in fetcher.data && fetcher.data.output) ? (
				<div className="absolute bottom-4 right-4 z-50 max-h-96 max-w-2xl overflow-auto whitespace-pre rounded-md border border-gray-700 bg-black p-4 font-mono text-xs text-white shadow-lg">
					<div className="mb-2 flex justify-between border-b border-gray-700 pb-2">
						<span className="font-bold">Sync Output</span>
					</div>
					{actionData && 'output' in actionData
						? actionData.output
						: fetcher.data && 'output' in fetcher.data
							? fetcher.data.output
							: ''}
				</div>
			) : null}
		</div>
	)
}
