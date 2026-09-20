/**
 * The Play button for read-aloud on the review pages. One control: play from
 * where she is, pause, resume. The label says what the voice is doing.
 */
import { Icon } from '#app/components/ui/icon'
import { cn } from '#app/utils/misc.tsx'
import { type NarrationState } from '#app/utils/use-narration.ts'

export const NARRATION_COPY = {
	play: 'Read to me',
	pause: 'Pause',
	resume: 'Keep reading',
	loading: 'Narrating',
	failed: 'Voice unavailable',
} as const

export function NarrationButton({
	narration,
	onToggle,
	disabled,
	size = 'lg',
	className,
}: {
	narration: NarrationState
	onToggle: () => void
	disabled?: boolean
	size?: 'sm' | 'lg'
	className?: string
}) {
	const { status, block, blocks, message } = narration
	const playing = status === 'playing' || status === 'loading'
	const label =
		status === 'playing'
			? NARRATION_COPY.pause
			: status === 'loading'
				? NARRATION_COPY.loading
				: status === 'paused'
					? NARRATION_COPY.resume
					: status === 'error' || status === 'unavailable'
						? NARRATION_COPY.failed
						: NARRATION_COPY.play
	const progress = block >= 0 && blocks > 0 ? `${block + 1} of ${blocks}` : null
	return (
		<button
			type="button"
			onClick={onToggle}
			disabled={disabled}
			aria-pressed={playing}
			aria-label={`${label}${progress ? `, paragraph ${progress}` : ''}`}
			title={message ?? undefined}
			className={cn(
				'inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium transition-colors disabled:opacity-50',
				size === 'lg' ? 'h-11 px-3 text-base' : 'h-8 px-2 text-sm',
				playing
					? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
					: 'border-input bg-background text-foreground hover:bg-accent',
				className,
			)}
		>
			<Icon
				name={status === 'playing' ? 'pause' : 'play'}
				className={cn(size === 'lg' ? 'h-5 w-5' : 'h-4 w-4', status === 'loading' && 'animate-pulse')}
			/>
			<span className={size === 'lg' ? '' : 'sr-only sm:not-sr-only'}>{label}</span>
			{progress ? (
				<span className="text-xs tabular-nums opacity-80">{progress}</span>
			) : null}
			{status === 'error' || status === 'unavailable' ? (
				<span className="sr-only">{message}</span>
			) : null}
		</button>
	)
}
