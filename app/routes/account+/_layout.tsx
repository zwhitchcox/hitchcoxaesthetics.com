import { Outlet, useLocation, useNavigate } from '@remix-run/react'

import { Tabs, TabsList, TabsTrigger } from '#app/components/ui/tabs'

const tabs = [
	{
		title: 'Account Info',
		to: '/account/info',
	},
	{
		title: 'Appointments',
		to: '/account/appointments',
	},
]
export default function () {
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const activeTab = pathname.split('/')[2] || 'info'
	return (
		<div className="flex w-full flex-col items-center">
			<Tabs
				className="my-4"
				defaultValue={activeTab}
				onValueChange={value => {
					if (value === 'info') value = 'info/general'
					navigate(`/account/${value}`)
				}}
			>
				<TabsList className="rounded-md">
					{tabs.map(tab => (
						<TabsTrigger
							key={tab.to}
							value={tab.to.replace('/account/', '')}
							className="text-md first:rounded-l-md last:rounded-r-md"
						>
							{tab.title}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			<Outlet />
		</div>
	)
}
