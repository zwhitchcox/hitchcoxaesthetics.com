import { NavLink, useLocation } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '#app/utils/misc.js'

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
	const linkRef = useRef<HTMLLIElement>(null)
	const [linkHeight, setLinkHeight] = useState(0)
	useEffect(() => {
		if (ulRef.current) {
			const firstLink = ulRef.current.querySelector('li')
			if (firstLink) {
				const rect = firstLink.getBoundingClientRect()
				setLinkHeight(rect.height)
			}
		}
	}, [ulRef])
	const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
	const handleMouseEnter = (index: number) => {
		setHoveredLinkIndex(index)
	}
	const handleMouseLeave = () => {
		setHoveredLinkIndex(null)
	}

	const dotStyle = {
		transform: `translateY(${
			hoveredLinkIndex !== null
				? linkHeight / 2 + dotSize / 3 + hoveredLinkIndex * linkHeight
				: 0
		}px) translateX(-1.5rem)`,
		opacity: hoveredLinkIndex !== null ? 1 : 0,
		transition: 'transform 0.2s ease-in-out, opacity 0.2s ease-in-out',
		width: dotSize,
		height: dotSize,
	}
	const { pathname } = useLocation()

	return (
		<ul className={cn('flex flex-col', className)} ref={ulRef}>
			<div className="dot rounded-full bg-foreground" style={dotStyle}></div>
			{links.map((link, index) => (
				<li
					key={link.to}
					ref={index === 0 ? linkRef : null} // Only set the ref on the first link
					onMouseEnter={() => {
						if (pathname === link.to) return
						handleMouseEnter(index)
					}}
					onMouseLeave={handleMouseLeave}
					className="group"
				>
					<NavLink
						className={({ isActive }) =>
							`flex items-center py-3 ${isActive ? 'italic text-muted-foreground' : ''}`
						}
						to={link.to}
						prefetch="intent"
					>
						{link.label}
					</NavLink>
					{link.hint && hoveredLinkIndex === index ? (
						<p className="hidden text-sm text-muted-foreground group-hover:block">
							{link.hint}
						</p>
					) : null}
				</li>
			))}
		</ul>
	)
}
