import fs from 'node:fs/promises'
import path from 'node:path'

export async function loadStaticLandingPage(options: {
	relativeHtmlPath: string
	serviceSlug: string
}) {
	const htmlPath = path.join(process.cwd(), options.relativeHtmlPath)
	return fs.readFile(htmlPath, 'utf8')
}
