import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { type LoaderFunctionArgs } from '@remix-run/node'

export async function loader({ params }: LoaderFunctionArgs) {
	const splat = params['*']
	if (!splat) throw new Response('Not Found', { status: 404 })

	// Security: Ensure path is within content directory and is a .webp file
	const safePath = path.normalize(splat).replace(/^(\.\.(\/|\\|$))+/, '')
	if (!safePath.endsWith('.webp')) {
		throw new Response('Forbidden', { status: 403 })
	}

	// Must be inside a .hero/ directory
	if (!safePath.includes('.hero/')) {
		throw new Response('Forbidden', { status: 403 })
	}

	const contentDir = path.join(process.cwd(), 'content')
	const filePath = path.join(contentDir, safePath)

	// Ensure the resolved path is still within contentDir (prevent traversal)
	if (!filePath.startsWith(contentDir)) {
		throw new Response('Forbidden', { status: 403 })
	}

	if (!fs.existsSync(filePath)) {
		throw new Response('Not Found', { status: 404 })
	}

	const stream = fs.createReadStream(filePath)

	return new Response(Readable.toWeb(stream) as any, {
		status: 200,
		headers: {
			'Content-Type': 'image/webp',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	})
}
