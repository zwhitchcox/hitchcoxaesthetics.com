export function LandingPageFrame({
	html,
	title,
}: {
	html: string
	title: string
}) {
	return (
		<iframe
			srcDoc={html}
			title={title}
			style={{
				border: 'none',
				display: 'block',
				height: '100dvh',
				left: 0,
				margin: 0,
				padding: 0,
				position: 'absolute',
				top: 0,
				width: '100vw',
				zIndex: 9999,
			}}
		/>
	)
}
