import { useEffect } from 'react'

/**
 * A bottom sheet for the phone review pages (/review). Tapping the backdrop
 * or pressing Escape closes it. The panel clears the home indicator.
 */
export function Sheet({
	title,
	onClose,
	children,
}: {
	title: string
	onClose: () => void
	children: React.ReactNode
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [onClose])

	return (
		<div className="fixed inset-0 z-40">
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute inset-0 h-full w-full bg-black/40"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
			>
				<div className="mx-auto max-w-xl">
					<p className="text-base font-medium">{title}</p>
					<div className="mt-3">{children}</div>
				</div>
			</div>
		</div>
	)
}

export function SheetError({ children }: { children: React.ReactNode }) {
	return (
		<p
			role="alert"
			className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
		>
			{children}
		</p>
	)
}
