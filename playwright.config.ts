import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const PORT = process.env.PORT || '4000'

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 15 * 1000,
	expect: {
		timeout: 5 * 1000,
	},
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: `http://localhost:${PORT}/`,
		trace: 'on-first-retry',
	},

	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
		},
	],

	webServer: {
		command: process.env.CI ? 'npm run start:mocks' : 'npm run dev',
		port: Number(PORT),
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			PORT,
			// The e2e server runs with MOCKS=true (MSW intercepts outbound email),
			// so a real key is never needed — but env validation requires it be set.
			RESEND_API_KEY: process.env.RESEND_API_KEY ?? 'MOCK_RESEND_API_KEY',
		},
	},
})
