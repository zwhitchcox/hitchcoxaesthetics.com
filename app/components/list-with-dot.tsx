import { NavLink, useLocation } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '#app/utils/misc.js'
import { ScrollArea } from './ui/scroll-area'

export function ListWithDot({
	links,
	className,
	dotSize = 6,
}: {
	className?: string
	links: { to: string; label: string; hint?: string }[]
	dotSize?: number
}) {
	const ulRef = useRef<HTMLUListElement>(null)
	const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
	const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(
		null,
	)
	const [dotPosition, setDotPosition] = useState(0)
	const { pathname } = useLocation()

	useEffect(() => {
		const index = links.findIndex(link => link.to === pathname)
		const firstLink = document.getElementById('nav-link-0')
		setSelectedLinkIndex(index !== -1 ? index : null)
		if (index !== -1) {
			const element = document.getElementById(`nav-link-${index}`)
			if (element) {
				const rect = element.getBoundingClientRect()
				setDotPosition(
					rect.top -
						(firstLink?.getBoundingClientRect().top ?? 0) +
						rect.height / 2,
				)
			}
		}
	}, [pathname, links])

	const handleMouseEnter = (index: number) => {
		const firstLink = document.getElementById('nav-link-0')
		setHoveredLinkIndex(index)
		const element = document.getElementById(`nav-link-${index}`)
		if (element) {
			const rect = element.getBoundingClientRect()
			setDotPosition(
				rect.top -
					(firstLink?.getBoundingClientRect().top ?? 0) +
					rect.height / 2,
			)
		}
	}

	const handleMouseLeave = () => {
		const firstLink = document.getElementById('nav-link-0')
		setHoveredLinkIndex(null)
		const element =
			selectedLinkIndex !== null
				? document.getElementById(`nav-link-${selectedLinkIndex}`)
				: null
		if (element) {
			const rect = element.getBoundingClientRect()
			setDotPosition(
				rect.top -
					(firstLink?.getBoundingClientRect().top ?? 0) +
					rect.height / 2,
			)
		} else {
			setDotPosition(-500)
		}
	}

	const dotStyle = {
		transform: `translateY(${dotPosition}px) translateX(-1.5rem)`,
		opacity: hoveredLinkIndex !== null || selectedLinkIndex !== null ? 1 : 0,
		transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
		width: dotSize,
		height: dotSize,
	}

	return (
		<ScrollArea className="h-full w-full">
			<div className="flex flex-col items-center">
				<ul className={cn('relative inline-block', className)} ref={ulRef}>
					<div
						className="absolute rounded-full bg-foreground"
						style={dotStyle}
					></div>
					{links.map((link, index) => (
						<li
							key={link.to}
							onMouseEnter={() => handleMouseEnter(index)}
							onMouseLeave={handleMouseLeave}
							className={cn('group/link')}
							id={`nav-link-${index}`}
						>
							<NavLink
								className={({ isActive }) =>
									`flex items-center py-3 ${isActive ? 'italic text-muted-foreground' : ''}`
								}
								to={link.to}
								prefetch="intent"
								target={link.to.startsWith('http') ? '_blank' : undefined}
							>
								{link.label}
							</NavLink>
							{link.hint ? (
								<p className="block text-sm text-muted-foreground group-hover/link:block">
									{link.hint}
								</p>
							) : null}
						</li>
					))}
				</ul>
			</div>
		</ScrollArea>
	)
}
