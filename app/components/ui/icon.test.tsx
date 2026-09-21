/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { expect, test } from 'vitest'
import { Icon } from '#app/components/ui/icon.tsx'

// The test setup turns every console.error into a thrown error, so a React
// ref warning fails these tests on its own.

test('an icon with text children draws the svg beside the text', () => {
	render(<Icon name="arrow-left">Back to home</Icon>)
	const use = screen.getByText('Back to home').querySelector('svg use')
	expect(use?.getAttribute('href')).toMatch(/#arrow-left$/)
})

test('an icon without children forwards its ref to the svg', () => {
	const ref = createRef<SVGSVGElement>()
	render(<Icon name="arrow-left" ref={ref} />)
	expect(ref.current?.tagName).toBe('svg')
})
