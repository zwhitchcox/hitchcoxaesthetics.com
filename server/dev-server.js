import { config as loadDotenv } from 'dotenv'
import { execa } from 'execa'

if (process.env.NODE_ENV !== 'production') {
	loadDotenv({ override: true })
}

if (process.env.NODE_ENV === 'production') {
	await import('./index.js')
} else {
	const useMocks =
		process.env.MOCKS ?? (process.env.RESEND_API_KEY ? 'false' : 'true')
	const command =
		'tsx watch --clear-screen=false --ignore ".cache/**" --ignore "app/**" --ignore "vite.config.ts.timestamp-*" --ignore "build/**" --ignore "node_modules/**" --inspect=9230 ./index.js'
	execa(command, {
		stdio: ['ignore', 'inherit', 'inherit'],
		shell: true,
		env: {
			FORCE_COLOR: true,
			...process.env,
			MOCKS: useMocks,
		},
		// https://github.com/sindresorhus/execa/issues/433
		windowsHide: false,
	})
}
