/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
	AttachButton,
	AttachmentThumb,
	ATTACHMENT_COPY,
	useArticleAttachment,
	type ArticleAttachment,
} from '#app/components/article-attachments.tsx'

function Harness({
	onReady,
	disabled = false,
}: {
	onReady?: (image: ArticleAttachment) => void
	disabled?: boolean
}) {
	const a = useArticleAttachment({ articleId: 'a1', disabled, onReady })
	return (
		<div>
			<AttachButton onPick={a.pickFile} disabled={disabled} />
			<AttachmentThumb
				attachment={a.attachment}
				status={a.status}
				error={a.error}
				previewUrl={a.previewUrl}
				onRemove={a.remove}
				onRetry={a.retry}
			/>
			<output data-testid="state">
				{a.status}:{a.attachment?.id ?? ''}
			</output>
		</div>
	)
}

function fileInput() {
	const input = document.querySelector('input[type="file"]')
	if (!(input instanceof HTMLInputElement)) throw new Error('no file input')
	return input
}

function jpeg(name = 'photo.jpg') {
	return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])], name, {
		type: 'image/jpeg',
	})
}

function jsonResponse(status: number, data: unknown) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

type Upload = { articleId: string; fileName: string }

/** A fetch mock for the upload resource. `answer` gets each upload in order. */
function mockUpload(
	answer: (upload: Upload, n: number) => Response | Promise<Response>,
) {
	const uploads: Upload[] = []
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		expect(url).toBe('/resources/article-image-upload')
		const body = init?.body
		if (!(body instanceof FormData)) throw new Error('not multipart')
		// jsdom's File and the one installGlobals sets differ, so read the name by shape
		const file = body.get('file') as { name?: string } | null
		const upload = {
			articleId: String(body.get('articleId')),
			fileName: typeof file?.name === 'string' ? file.name : '',
		}
		uploads.push(upload)
		return answer(upload, uploads.length)
	})
	vi.stubGlobal('fetch', fetchMock)
	return { fetchMock, uploads }
}

const IMAGE = {
	id: 'img-1',
	fileName: 'user-img-1.jpg',
	width: 640,
	height: 480,
	url: '/resources/article-images/img-1',
}

beforeEach(() => {
	// jsdom has no object URLs
	Object.defineProperty(URL, 'createObjectURL', {
		value: vi.fn(() => 'blob:preview'),
		configurable: true,
	})
	Object.defineProperty(URL, 'revokeObjectURL', {
		value: vi.fn(),
		configurable: true,
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
	Reflect.deleteProperty(URL, 'createObjectURL')
	Reflect.deleteProperty(URL, 'revokeObjectURL')
})

test('a pick over 10 MB shows the size line and uploads nothing', async () => {
	const user = userEvent.setup()
	const { fetchMock } = mockUpload(() => jsonResponse(200, { image: IMAGE }))
	render(<Harness />)
	const big = jpeg('big.jpg')
	Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
	await user.upload(fileInput(), big)
	expect(await screen.findByText(ATTACHMENT_COPY.tooBig)).toBeTruthy()
	expect(fetchMock).not.toHaveBeenCalled()
	expect(screen.queryByRole('img')).toBeNull()
	expect(screen.getByTestId('state').textContent).toBe('failed:')
})

test('a wrong type shows the type line', async () => {
	const user = userEvent.setup({ applyAccept: false })
	const { fetchMock } = mockUpload(() => jsonResponse(200, { image: IMAGE }))
	render(<Harness />)
	const pdf = new File(
		[new Uint8Array([0x25, 0x50, 0x44, 0x46])],
		'notes.pdf',
		{
			type: 'application/pdf',
		},
	)
	await user.upload(fileInput(), pdf)
	expect(await screen.findByText(ATTACHMENT_COPY.wrongType)).toBeTruthy()
	expect(fetchMock).not.toHaveBeenCalled()
})

test('a good pick shows Uploading… then the check and the caption line, and onReady gets the image', async () => {
	const user = userEvent.setup()
	let land!: (value: Response) => void
	const landed = new Promise<Response>(resolve => (land = resolve))
	const { uploads } = mockUpload(() => landed)
	const onReady = vi.fn()
	render(<Harness onReady={onReady} />)
	await user.upload(fileInput(), jpeg())
	expect(await screen.findByText(ATTACHMENT_COPY.uploading)).toBeTruthy()
	expect(screen.getByRole('img')).toBeTruthy()
	expect(uploads).toEqual([{ articleId: 'a1', fileName: 'photo.jpg' }])
	land(jsonResponse(200, { image: IMAGE }))
	expect(await screen.findByText(ATTACHMENT_COPY.ready)).toBeTruthy()
	expect(screen.queryByText(ATTACHMENT_COPY.uploading)).toBeNull()
	expect(screen.getByTestId('state').textContent).toBe('ready:img-1')
	expect(onReady).toHaveBeenCalledWith({ ...IMAGE, previewUrl: 'blob:preview' })
	expect(
		screen.getByRole('button', { name: ATTACHMENT_COPY.remove }),
	).toBeTruthy()
})

test("a 415 shows the server's line with Try again, and Try again uploads once more", async () => {
	const user = userEvent.setup()
	const { fetchMock } = mockUpload((_upload, n) =>
		n === 1
			? jsonResponse(415, { error: ATTACHMENT_COPY.heic })
			: jsonResponse(200, { image: IMAGE }),
	)
	render(<Harness />)
	await user.upload(fileInput(), jpeg('live.heic'))
	const alert = await screen.findByRole('alert')
	expect(alert.textContent).toContain(ATTACHMENT_COPY.failed)
	expect(alert.textContent).toContain(ATTACHMENT_COPY.heic)
	// the thumbnail stays so she sees which picture failed
	expect(screen.getByRole('img')).toBeTruthy()
	await user.click(
		screen.getByRole('button', { name: ATTACHMENT_COPY.tryAgain }),
	)
	expect(await screen.findByText(ATTACHMENT_COPY.ready)).toBeTruthy()
	expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('a 429 shows the too-many line and a lost connection the network line', async () => {
	const user = userEvent.setup()
	mockUpload(() => jsonResponse(429, { error: 'nope' }))
	render(<Harness />)
	await user.upload(fileInput(), jpeg())
	expect((await screen.findByRole('alert')).textContent).toContain(
		ATTACHMENT_COPY.tooMany,
	)

	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			throw new TypeError('Failed to fetch')
		}),
	)
	await user.click(
		screen.getByRole('button', { name: ATTACHMENT_COPY.tryAgain }),
	)
	await waitFor(() =>
		expect(screen.getByRole('alert').textContent).toContain(
			ATTACHMENT_COPY.network,
		),
	)
})

test('Remove the picture detaches it', async () => {
	const user = userEvent.setup()
	mockUpload(() => jsonResponse(200, { image: IMAGE }))
	render(<Harness />)
	await user.upload(fileInput(), jpeg())
	expect(await screen.findByText(ATTACHMENT_COPY.ready)).toBeTruthy()
	await user.click(screen.getByRole('button', { name: ATTACHMENT_COPY.remove }))
	expect(screen.queryByRole('img')).toBeNull()
	expect(screen.queryByText(ATTACHMENT_COPY.ready)).toBeNull()
	expect(screen.getByTestId('state').textContent).toBe('idle:')
})

test('a second pick replaces the first, and the first upload is ignored when it lands late', async () => {
	const user = userEvent.setup()
	let landFirst!: (value: Response) => void
	const first = new Promise<Response>(resolve => (landFirst = resolve))
	const { uploads } = mockUpload((_upload, n) =>
		n === 1 ? first : jsonResponse(200, { image: { ...IMAGE, id: 'img-2' } }),
	)
	render(<Harness />)
	await user.upload(fileInput(), jpeg('one.jpg'))
	expect(await screen.findByText(ATTACHMENT_COPY.uploading)).toBeTruthy()
	await user.upload(fileInput(), jpeg('two.jpg'))
	await waitFor(() =>
		expect(screen.getByTestId('state').textContent).toBe('ready:img-2'),
	)
	expect(uploads.map(u => u.fileName)).toEqual(['one.jpg', 'two.jpg'])
	landFirst(jsonResponse(200, { image: IMAGE }))
	await new Promise(resolve => setTimeout(resolve, 20))
	expect(screen.getByTestId('state').textContent).toBe('ready:img-2')
})

test('the button and the input are disabled when the composer is', () => {
	render(<Harness disabled />)
	expect(
		screen
			.getByRole('button', { name: ATTACHMENT_COPY.add })
			.hasAttribute('disabled'),
	).toBe(true)
	expect(fileInput().disabled).toBe(true)
})
