import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link } from '@remix-run/react'
import { Icon } from '#app/components/ui/icon'
import { requireUserWithRole } from '#app/utils/permissions.server'

export async function loader({ request }: LoaderFunctionArgs) {
	// Require admin role to access admin dashboard
	await requireUserWithRole(request, 'admin')

	return json({})
}

// Admin quick links with icons for the dashboard
const adminQuickLinks = [
	{
		title: 'Reviews',
		icon: 'star' as const,
		description: 'Manage and view customer reviews',
		path: '/admin/reviews',
		color: 'bg-yellow-100 dark:bg-yellow-950',
	},
	{
		title: 'Analysis',
		icon: 'dashboard' as const,
		description: 'View business analytics and reports',
		path: '/admin/analysis',
		color: 'bg-purple-100 dark:bg-purple-950',
	},
	{
		title: 'Appointments',
		icon: 'calendar' as const,
		description: 'Manage upcoming appointments',
		path: '/admin/appointments',
		color: 'bg-green-100 dark:bg-green-950',
	},
	{
		title: 'Background Jobs',
		icon: 'clock' as const,
		description: 'Monitor and trigger background tasks',
		path: '/admin/bg',
		color: 'bg-blue-100 dark:bg-blue-950',
	},
]

export default function AdminDashboard() {
	return (
		<div>
			<h2 className="mb-6 text-xl font-semibold">
				Welcome to the Admin Dashboard
			</h2>

			<div className="mb-8">
				<h3 className="mb-4 text-lg font-medium">Quick Links</h3>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{adminQuickLinks.map(link => (
						<Link
							key={link.path}
							to={link.path}
							className="group flex flex-col rounded-lg border p-4 transition-all hover:shadow-md"
						>
							<div
								className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${link.color}`}
							>
								<Icon name={link.icon} className="h-6 w-6" />
							</div>
							<h4 className="mb-1 font-medium group-hover:text-primary">
								{link.title}
							</h4>
							<p className="text-sm text-muted-foreground">
								{link.description}
							</p>
							<div className="mt-auto pt-3 text-sm font-medium text-primary">
								Access {link.title} →
							</div>
						</Link>
					))}
				</div>
			</div>

			<div className="rounded-lg border bg-card p-6">
				<h3 className="mb-4 text-lg font-medium">Recent Activity</h3>
				<div className="text-sm text-muted-foreground">
					<p>
						Welcome to your admin dashboard. Use the sidebar to navigate between
						different sections.
					</p>
					<p className="mt-2">
						For any technical issues, please contact support.
					</p>
				</div>
			</div>
		</div>
	)
}
