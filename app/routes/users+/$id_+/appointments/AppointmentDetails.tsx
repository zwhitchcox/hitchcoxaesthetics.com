import { type Service, type User } from '@prisma/client'
import { type SerializeFrom } from '@remix-run/node'

import { Icon } from '#app/components/ui/icon.js'
import { cn } from '#app/utils/misc.js'

export function AppointmentDetails({
	service,
	date,
	direction,
	className,
	client,
	provider,
}: {
	service?: SerializeFrom<Service>
	date?: Date
	direction: 'row' | 'column'
	className?: string
	client?: SerializeFrom<User>
	provider?: SerializeFrom<User>
}) {
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})
	const timeFormatter = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
	})
	const endTime =
		date && service?.duration
			? new Date(date.getTime() + service!.duration * 60000)
			: null
	return (
		<div className={cn(`mx-4 flex w-full flex-col items-center`, className)}>
			<div
				className={`mt-1 flex w-full max-w-md items-center space-y-2 rounded-lg py-2 text-lg ${
					direction === 'row' ? 'space-x-8' : 'flex-col'
				}`}
			>
				{provider ? (
					<div className="flex shrink-0 flex-col items-center space-y-2 justify-self-start rounded-lg">
						<img
							src={`/img/${provider.id}-sq.jpg`}
							alt="sarah"
							className="block h-24 w-24 rounded-full"
						/>
						<div className="flex flex-col items-center text-xl font-medium leading-5 tracking-wide">
							<div>{provider.name}</div>
							{/* <div className="text-[1rem] text-muted-foreground">RN, BSN</div> */}
						</div>
					</div>
				) : null}
				<div className="flex flex-col items-center space-y-2">
					{service?.title ? (
						<div className="flex w-full flex-col rounded-lg">
							<div className="text-lg font-medium tracking-wide">
								{service?.title} {client?.name ? `with ${client?.name}` : ''}
							</div>
							<div className="text-sm text-muted-foreground">
								{service?.hint}
							</div>
						</div>
					) : null}
					<div className="flex w-full flex-col items-start text-[.95rem]">
						{date && endTime ? (
							<>
								<div className="flex items-center space-x-1">
									<Icon name="calendar" className="-my-2 size-5" />
									<div>{dateFormatter.format(date)}</div>
								</div>
								<div className="flex items-center space-x-1">
									<Icon name="calendar" className="-my-2 size-5 opacity-0" />
									<div>{`${timeFormatter.format(date)} – ${timeFormatter.format(
										endTime,
									)}`}</div>
								</div>
							</>
						) : null}
						{service ? (
							<div className="flex items-center space-x-1">
								<Icon name="clock" className="-my-2 size-5" />
								<div>{service.duration} mins</div>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	)
}
