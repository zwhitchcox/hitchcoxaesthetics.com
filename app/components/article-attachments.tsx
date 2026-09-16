import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type DragEvent,
	type ReactNode,
} from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	ARTICLE_IMAGE_MAX_BYTES,
	ARTICLE_IMAGE_UPLOAD_COPY,
	ARTICLE_IMAGE_UPLOAD_ENDPOINT,
	articleImageUrl,
} from '#app/utils/article-images.ts'
import { cn } from '#app/utils/misc.tsx'

/**
 * A picture Sarah attaches to a chat message: the pick (camera button,
 * drop, paste), the upload to /resources/article-image-upload, and the
 * thumbnail with its state. The editor mounts these around its composer and
 * sends `attachment.id` as `imageId` with her words.
 *
 * One picture per message. A second pick replaces the first. The upload
 * starts at once; Send waits for it. Removing a picture only detaches it:
 * the stored row stays and nothing references it.
 */

export const ATTACHMENT_COPY = {
	...ARTICLE_IMAGE_UPLOAD_COPY,
	add: 'Add a picture',
	remove: 'Remove the picture',
	uploading: 'Uploading…',
	uploaded: 'Uploaded',
	ready:
		'Say where it goes. For example: use this instead of the second picture.',
	failed: 'Did not upload.',
	tryAgain: 'Try again',
	drop: 'Drop the picture here',
	network: 'The picture did not upload. Check the connection and try again.',
} as const

export type ArticleAttachment = {
	id: string
	fileName: string
	width: number | null
	height: number | null
	/** The served path of the stored picture. */
	url: string
	/** What the thumbnail shows: the local file while it exists, else `url`. */
	previewUrl: string
}

export type AttachmentStatus = 'idle' | 'uploading' | 'ready' | 'failed'

/** The picture types the client lets through. The server checks the bytes. */
const CLIENT_TYPES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
])

function makePreviewUrl(file: File): string | null {
	return typeof URL.createObjectURL === 'function'
		? URL.createObjectURL(file)
		: null
}

function dropPreviewUrl(url: string | null) {
	if (
		url &&
		url.startsWith('blob:') &&
		typeof URL.revokeObjectURL === 'function'
	) {
		URL.revokeObjectURL(url)
	}
}

export function useArticleAttachment({
	articleId,
	disabled = false,
	onReady,
}: {
	articleId: string
	disabled?: boolean
	/** Called once an upload lands. */
	onReady?: (image: ArticleAttachment) => void
}) {
	const [file, setFile] = useState<File | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [attachment, setAttachment] = useState<ArticleAttachment | null>(null)
	const [status, setStatus] = useState<AttachmentStatus>('idle')
	const [error, setError] = useState<string | null>(null)
	// Each upload gets a number; an answer for an older one is ignored.
	const uploadSeq = useRef(0)
	const previewRef = useRef<string | null>(null)
	const onReadyRef = useRef(onReady)
	onReadyRef.current = onReady

	const setPreview = useCallback((url: string | null) => {
		dropPreviewUrl(previewRef.current)
		previewRef.current = url
		setPreviewUrl(url)
	}, [])

	useEffect(() => () => dropPreviewUrl(previewRef.current), [])

	const upload = useCallback(
		async (f: File, preview: string | null) => {
			const seq = ++uploadSeq.current
			setStatus('uploading')
			setError(null)
			setAttachment(null)
			const form = new FormData()
			form.append('articleId', articleId)
			form.append('file', f, f.name || 'picture')
			let res: Response
			try {
				res = await fetch(ARTICLE_IMAGE_UPLOAD_ENDPOINT, {
					method: 'POST',
					body: form,
					credentials: 'same-origin',
				})
			} catch {
				if (seq !== uploadSeq.current) return
				setStatus('failed')
				setError(ATTACHMENT_COPY.network)
				return
			}
			if (seq !== uploadSeq.current) return
			const data = (await res.json().catch(() => null)) as {
				image?: Omit<ArticleAttachment, 'previewUrl'>
				error?: string
				message?: string
			} | null
			if (!res.ok || !data?.image) {
				setStatus('failed')
				setError(
					res.status === 429
						? ATTACHMENT_COPY.tooMany
						: data?.message || data?.error || ATTACHMENT_COPY.network,
				)
				return
			}
			const image: ArticleAttachment = {
				...data.image,
				previewUrl: preview ?? data.image.url,
			}
			setAttachment(image)
			setStatus('ready')
			onReadyRef.current?.(image)
		},
		[articleId],
	)

	const fail = useCallback(
		(message: string) => {
			uploadSeq.current += 1
			setPreview(null)
			setFile(null)
			setAttachment(null)
			setStatus('failed')
			setError(message)
		},
		[setPreview],
	)

	const pickFile = useCallback(
		(f: File) => {
			if (disabled) return
			if (f.size > ARTICLE_IMAGE_MAX_BYTES) return fail(ATTACHMENT_COPY.tooBig)
			if (f.type && !CLIENT_TYPES.has(f.type.toLowerCase())) {
				return fail(ATTACHMENT_COPY.wrongType)
			}
			const preview = makePreviewUrl(f)
			setPreview(preview)
			setFile(f)
			void upload(f, preview)
		},
		[disabled, fail, setPreview, upload],
	)

	const remove = useCallback(() => {
		uploadSeq.current += 1
		setPreview(null)
		setFile(null)
		setAttachment(null)
		setStatus('idle')
		setError(null)
	}, [setPreview])

	const retry = useCallback(() => {
		if (file) void upload(file, previewRef.current)
	}, [file, upload])

	/** Keep a stored picture attached (the last message carried it and no change followed). */
	const keep = useCallback(
		(imageId: string) => {
			uploadSeq.current += 1
			setPreview(null)
			setFile(null)
			const url = articleImageUrl(imageId)
			setAttachment({
				id: imageId,
				fileName: '',
				width: null,
				height: null,
				url,
				previewUrl: url,
			})
			setStatus('ready')
			setError(null)
		},
		[setPreview],
	)

	return {
		attachment,
		status,
		error,
		previewUrl,
		pickFile,
		remove,
		retry,
		keep,
	}
}

/** The camera button and its hidden file input. No `capture`: the phone offers camera or library. */
export function AttachButton({
	onPick,
	disabled = false,
	className,
}: {
	onPick: (file: File) => void
	disabled?: boolean
	className?: string
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept="image/jpeg,image/png,image/webp,image/*"
				className="sr-only"
				tabIndex={-1}
				aria-hidden
				disabled={disabled}
				onChange={event => {
					const f = event.currentTarget.files?.[0]
					event.currentTarget.value = ''
					if (f) onPick(f)
				}}
			/>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={ATTACHMENT_COPY.add}
				disabled={disabled}
				className={cn('shrink-0 rounded-full', className)}
				onClick={() => inputRef.current?.click()}
			>
				<Icon name="camera" size="md" />
			</Button>
		</>
	)
}

function dragHasFiles(event: DragEvent) {
	return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/** Dragging a file over the children shows the dashed overlay; a drop picks it. */
export function DropZone({
	enabled,
	onPick,
	children,
	className,
}: {
	enabled: boolean
	onPick: (file: File) => void
	children: ReactNode
	className?: string
}) {
	const [over, setOver] = useState(false)
	const depth = useRef(0)
	return (
		<div
			className={cn('relative', className)}
			onDragEnter={event => {
				if (!enabled || !dragHasFiles(event)) return
				event.preventDefault()
				depth.current += 1
				setOver(true)
			}}
			onDragOver={event => {
				if (!enabled || !dragHasFiles(event)) return
				event.preventDefault()
				event.dataTransfer.dropEffect = 'copy'
			}}
			onDragLeave={() => {
				if (!enabled) return
				depth.current = Math.max(0, depth.current - 1)
				if (depth.current === 0) setOver(false)
			}}
			onDrop={event => {
				if (!enabled) return
				event.preventDefault()
				depth.current = 0
				setOver(false)
				const f = event.dataTransfer.files?.[0]
				if (f) onPick(f)
			}}
		>
			{children}
			{over ? (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium"
				>
					{ATTACHMENT_COPY.drop}
				</div>
			) : null}
		</div>
	)
}

/** The 56 px thumbnail above the box with its state and the remove button. */
export function AttachmentThumb({
	attachment,
	status,
	error,
	previewUrl,
	onRemove,
	onRetry,
	className,
}: {
	attachment: ArticleAttachment | null
	status: AttachmentStatus
	error: string | null
	/** The local preview while an upload runs or failed (the hook returns it). */
	previewUrl?: string | null
	onRemove: () => void
	onRetry: () => void
	className?: string
}) {
	if (status === 'idle' && !error) return null
	const src = attachment?.previewUrl ?? previewUrl ?? null
	if (!src) {
		// a pick the client refused: no thumbnail, one line
		return (
			<p role="alert" className={cn('text-sm text-destructive', className)}>
				{error}
			</p>
		)
	}
	return (
		<div
			data-status={status}
			className={cn(
				'flex items-start gap-3 rounded-lg border bg-muted/30 p-2',
				className,
			)}
		>
			<img
				src={src}
				alt=""
				className="h-14 w-14 shrink-0 rounded object-cover"
				width={56}
				height={56}
			/>
			<div className="min-w-0 flex-1 text-sm">
				{status === 'uploading' ? (
					<p className="flex items-center gap-1.5 text-muted-foreground">
						<Icon name="update" className="animate-spin" aria-hidden />
						{ATTACHMENT_COPY.uploading}
					</p>
				) : status === 'ready' ? (
					<p className="flex items-start gap-1.5 text-muted-foreground">
						<Icon
							name="check"
							className="mt-0.5 shrink-0 text-primary"
							aria-hidden
						/>
						<span>
							<span className="sr-only">{ATTACHMENT_COPY.uploaded}. </span>
							{ATTACHMENT_COPY.ready}
						</span>
					</p>
				) : (
					<p role="alert" className="text-destructive">
						{ATTACHMENT_COPY.failed} {error}{' '}
						<button
							type="button"
							className="underline underline-offset-2"
							onClick={onRetry}
						>
							{ATTACHMENT_COPY.tryAgain}
						</button>
					</p>
				)}
			</div>
			<button
				type="button"
				aria-label={ATTACHMENT_COPY.remove}
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
				onClick={onRemove}
			>
				<Icon name="cross-1" size="sm" aria-hidden />
			</button>
		</div>
	)
}
