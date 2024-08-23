import { NavLink, useLocation } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '#app/utils/misc.js'
import { Icon } from './ui/icon'
import { ScrollArea } from './ui/scroll-area'

export type MenuLink = {
	to: string
	label: string
	hint?: string
	subLinks?: MenuLink[]
}

export function ListWithDot({
	links,
	className,
	dotSize = 6,
}: {
	className?: string
	links: MenuLink[]
	dotSize?: number
}) {
	const ulRef = useRef<HTMLUListElement>(null)
	const scrollAreaRef = useRef<HTMLDivElement>(null)
	const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null)
	const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(
		null,
	)
	const [dotPosition, setDotPosition] = useState(0)
	const { pathname } = useLocation()
	const [activeSubMenus, setActiveSubMenus] = useState<number[]>([])

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

	const handleLinkClick = () => {
		if (scrollAreaRef.current) {
			scrollAreaRef.current.scrollTop = 0
		}
	}

	const renderLinks = (linksToRender: MenuLink[], level: number = 0) => (
		<ul className={cn('relative inline-block', className)} ref={ulRef}>
			{level === 0 && (
				<div
					className="absolute rounded-full bg-foreground"
					style={dotStyle}
				></div>
			)}
			{level > 0 && (
				<li
					key="back"
					onMouseEnter={() => handleMouseEnter(-1)}
					onMouseLeave={handleMouseLeave}
					className={cn('group/link', 'py-1')}
					id="nav-link-back"
				>
					<button
						className="flex w-full flex-col items-center py-2"
						onClick={() => {
							setActiveSubMenus(prev => prev.slice(0, -1))
							handleLinkClick()
						}}
					>
						<div className="flex items-center">
							<Icon name="arrow-left" className="mr-2 h-4 w-4" />
							Back
						</div>
					</button>
				</li>
			)}
			{linksToRender.map((link, index) => (
				<li
					key={link.to}
					onMouseEnter={() => handleMouseEnter(index)}
					onMouseLeave={handleMouseLeave}
					className={cn('group/link', 'py-1')}
					id={`nav-link-${index}`}
				>
					{link.subLinks ? (
						<button
							className="flex w-full flex-col items-center py-2"
							onClick={() => {
								setActiveSubMenus(prev => [...prev, index])
								handleLinkClick()
							}}
						>
							<div className="flex items-center">
								{link.label}
								<Icon name="chevron-right" className="ml-2 h-4 w-4" />
							</div>
							{link.hint && (
								<div className="block text-center text-sm text-muted-foreground group-hover/link:block">
									{link.hint}
								</div>
							)}
						</button>
					) : (
						<NavLink
							className={({ isActive }) =>
								`flex flex-col items-center py-2 ${
									isActive ? 'italic text-muted-foreground' : ''
								}`
							}
							to={link.to}
							prefetch="intent"
							target={link.to.startsWith('http') ? '_blank' : undefined}
							onClick={handleLinkClick}
						>
							<div>{link.label}</div>
							{link.hint && (
								<div className="block text-center text-sm text-muted-foreground group-hover/link:block">
									{link.hint}
								</div>
							)}
						</NavLink>
					)}
				</li>
			))}
		</ul>
	)

	const getCurrentLinks = (
		links: MenuLink[],
		activeSubMenus: number[],
	): MenuLink[] => {
		if (activeSubMenus.length === 0) return links
		const currentSubMenu = links[activeSubMenus[0]]
		if (!currentSubMenu.subLinks) return links
		return getCurrentLinks(currentSubMenu.subLinks, activeSubMenus.slice(1))
	}

	return (
		<ScrollArea className="h-full w-full" viewportRef={scrollAreaRef}>
			<div className="flex flex-col items-center">
				{renderLinks(
					getCurrentLinks(links, activeSubMenus),
					activeSubMenus.length,
				)}
			</div>
		</ScrollArea>
	)
}
