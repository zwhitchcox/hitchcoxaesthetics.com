import { Link, useLocation } from '@remix-run/react'
import React from 'react'

import { bookSteps, useStepStatuses } from '#/app/routes/book+/book'

export function StepTracker() {
	const current = useLocation()
		.pathname.split('/')
		.at(-1) as (typeof bookSteps)[number]['name']
	const stepStatuses = useStepStatuses()
	return (
		<div className="flex w-full max-w-2xl items-center justify-between px-4 py-2">
			{stepStatuses.map(({ name, valid }, index) => {
				const isActive = name === current
				const canNav = valid || stepStatuses[index - 1]?.valid
				return (
					<React.Fragment key={index}>
						<Link
							to={`/book/${name}`}
							onClick={e => canNav || e.preventDefault()}
						>
							<div
								key={name}
								className={`relative z-10 flex flex-col items-center ${
									isActive
										? 'cursor-default'
										: canNav
											? 'cursor-pointer'
											: 'cursor-not-allowed'
								}`}
							>
								<div
									className={`flex h-8 w-8 items-center justify-center rounded-full ${
										isActive
											? 'bg-gray-700 text-white'
											: valid
												? 'bg-gray-500 text-white'
												: 'bg-gray-300 text-gray-800'
									}`}
								>
									{valid ? '✓' : index + 1}
								</div>
								<div
									className={`text-sm ${
										isActive ? 'text-gray-700' : 'text-gray-500'
									}`}
								>
									{name.charAt(0).toUpperCase() + name.slice(1)}
								</div>
							</div>
						</Link>
						{index < bookSteps.length - 1 && (
							<div
								className={`h-0.5 w-full -translate-y-2 ${
									valid || isActive ? 'bg-gray-500' : 'bg-gray-300'
								}`}
							/>
						)}
					</React.Fragment>
				)
			})}
		</div>
	)
}
