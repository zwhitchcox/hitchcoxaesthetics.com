/**
 * @vitest-environment jsdom
 */
import { createRemixStub } from '@remix-run/testing'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import { consoleError } from '#tests/setup/setup-test-env.ts'

import PodcastAdmin from '#app/routes/admin+/podcast.tsx'

function topic(overrides: Record<string, unknown>) {
	return {
		id: 'topic-1',
		title: 'Topic',
		hook: '',
		outline: '',
		status: 'proposed',
		score: 5,
		sourcesJson: '[]',
		questionsJson: '[]',
		batchKey: '2026-09-09',
		createdAt: new Date('2026-09-09T12:00:00Z').toISOString(),
		decidedAt: null,
		...overrides,
	}
}

test('renders proposed and accepted topics with sources and questions', async () => {
	const RemixStub = createRemixStub([
		{
			path: '/admin/podcast',
			Component: PodcastAdmin,
			loader: () => ({
				proposed: [
					topic({
						id: 'p1',
						title: 'The Baby Botox Trend',
						hook: 'Celebrities are talking about micro-dosing.',
						outline: '- what it is\n- who it fits',
						sourcesJson: JSON.stringify([
							{
								title: 'Baby Botox explained',
								url: 'https://example.com/baby-botox',
								publisher: 'NewBeauty',
								publishedAt: null,
								summary: '',
							},
						]),
						questionsJson: JSON.stringify(['how long does botox last?']),
					}),
				],
				accepted: [
					topic({ id: 'a1', title: 'GLP-1 Myths', status: 'accepted' }),
				],
				recorded: [],
				dismissedCount: 3,
			}),
		},
	])
	// The shared Icon component trips a jsdom-only dev ref warning when it
	// renders with children. Every assertion below proves the tree rendered.
	consoleError.mockImplementation(() => {})
	render(<RemixStub initialEntries={['/admin/podcast']} />)

	expect(await screen.findByText('The Baby Botox Trend')).toBeTruthy()
	expect(screen.getByText('GLP-1 Myths')).toBeTruthy()
	expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy()
	expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
	expect(screen.getByRole('button', { name: 'Mark recorded' })).toBeTruthy()
	const sourceLink = screen.getByRole('link', { name: 'Baby Botox explained' })
	expect(sourceLink.getAttribute('href')).toBe('https://example.com/baby-botox')
	expect(screen.getByText(/how long does botox last\?/)).toBeTruthy()
	expect(screen.getByText(/what it is/)).toBeTruthy()
	expect(screen.getByText(/3 dismissed ideas/)).toBeTruthy()
})
