import * as React from 'react'
import { DayPicker } from 'react-day-picker'

import { buttonVariants } from '#/app/components/ui/button'
import { cn } from '#app/utils/misc.js'

import { Icon } from './icon'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	...props
}: CalendarProps) {
	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn('w-full rounded-md border p-3', className)}
			classNames={{
				months: 'flex w-full flex-wrap',
				month: 'w-full px-3',
				caption: 'relative flex justify-start items-center py-2 px-3',
				caption_label: 'text-md font-medium',
				nav: 'flex items-center justify-end w-full absolute px-3',
				nav_button: cn(
					buttonVariants({ variant: 'outline' }),
					'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
				),
				table: 'w-full border-collapse',
				head_row: 'flex w-full',
				head_cell:
					'text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center',
				row: 'flex w-full',
				cell: 'flex-1 text-center text-sm p-1 relative aspect-square',
				day: cn(
					buttonVariants({ variant: 'ghost' }),
					'w-full h-full min-w-0 p-0 font-normal aria-selected:opacity-100 justify-center items-center',
				),
				nav_button_previous: 'border-0',
				nav_button_next: 'border-0',
				day_range_end: 'day-range-end',
				day_selected:
					'bg-secondary text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground focus:bg-secondary focus:text-secondary-foreground',
				day_today: 'bg-accent text-accent-foreground',
				day_outside:
					'day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30',
				day_disabled: 'text-muted-foreground opacity-50',
				day_range_middle:
					'aria-selected:bg-accent aria-selected:text-accent-foreground',
				day_hidden: 'invisible',
				...classNames,
			}}
			components={{
				IconLeft: () => <Icon name="chevron-left" className="h-4 w-4" />,
				IconRight: () => <Icon name="chevron-right" className="h-4 w-4" />,
			}}
			{...props}
		/>
	)
}
Calendar.displayName = 'Calendar'

export { Calendar }
