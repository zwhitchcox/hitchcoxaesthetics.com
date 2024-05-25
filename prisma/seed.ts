import { spawn } from 'child_process'
import { readdirSync } from 'fs'
import { join } from 'path'

const seedDir = join(import.meta.dirname, 'seed')
const allThings = await readdirSync(seedDir)

async function seed(thing: string) {
	if (thing == null) {
		for (const thing of allThings) {
			await seed(thing.replace('.ts', ''))
		}
		return
	}
	const prisma = spawn('pnpm', ['tsx', `prisma/seed/${thing}.ts`])
	prisma.stdout.on('data', data => {
		console.log(`stdout: ${data}`)
	})
	prisma.stderr.on('data', data => {
		console.error(`stderr: ${data}`)
	})
	prisma.on('close', code => {
		console.log(`${thing} process exited with code ${code}`)
	})
}

seed(process.argv[2])
