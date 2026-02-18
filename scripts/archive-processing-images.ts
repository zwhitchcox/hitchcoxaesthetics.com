#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'

const WORKING_DIR = path.join(process.cwd(), 'processing-images')
const ARCHIVE_ROOT = path.join(process.cwd(), 'processing-images-archive')
const SUBDIRS = [
	'sources',
	'normalized',
	'split',
	'cleaned',
	'white',
	'black',
	'nobg',
	'nobg-manual',
	'final',
]

function formatTimestamp(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate(),
	)}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(
		date.getSeconds(),
	)}`
}

function ensureDir(dir: string) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function createFreshWorkingDir() {
	ensureDir(WORKING_DIR)
	for (const sub of SUBDIRS) {
		ensureDir(path.join(WORKING_DIR, sub))
	}
}

function main() {
	if (!fs.existsSync(WORKING_DIR)) {
		console.log('No processing-images/ directory found. Nothing to archive.')
		process.exit(0)
	}

	ensureDir(ARCHIVE_ROOT)
	const archiveName = formatTimestamp(new Date())
	const archiveDir = path.join(ARCHIVE_ROOT, archiveName)

	if (fs.existsSync(archiveDir)) {
		console.error(`Archive already exists: ${archiveDir}`)
		process.exit(1)
	}

	fs.renameSync(WORKING_DIR, archiveDir)
	createFreshWorkingDir()

	console.log(`Archived to: ${archiveDir}`)
	console.log('Created fresh processing-images/ working directory.')
}

main()
