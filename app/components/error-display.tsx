import React from 'react'

import { cn } from '#app/utils/misc.js'

type ErrorProps = {
	message?: string | string[]
	id?: string
	className?: string
}

const ErrorDisplay: React.FC<ErrorProps> = ({ message, id, className }) => {
	if (!message) return null
	return (
		<div
			id={id}
			className={cn('text-red-700', className)}
			aria-live="assertive"
		>
			{Array.isArray(message) ? (
				<ul>
					{message.map((msg, index) => (
						<li key={index}>{msg}</li>
					))}
				</ul>
			) : (
				<p>{message}</p>
			)}
		</div>
	)
}

export default ErrorDisplay
