import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	Link,
	Outlet,
	useLocation,
	useRouteError,
	isRouteErrorResponse,
} from '@remix-run/react'
import { Button } from '#app/components/ui/button'
import { Icon } from '#app/components/ui/icon'
import { requireUserWithRole } from '#app/utils/permissions.server'

// SEO handle to prevent indexing of admin pages
export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

// Define the admin menu items with valid icon names
const adminMenuItems = [
	{ path: '/admin', label: 'Dashboard', icon: 'dashboard' as const },
	{ path: '/admin/reviews', label: 'Reviews', icon: 'star' as const },
	{ path: '/admin/analysis', label: 'Analysis', icon: 'dashboard' as const },
	{
		path: '/admin/appointments',
		label: 'Appointments',
		icon: 'calendar' as const,
	},
	{ path: '/admin/bg', label: 'Background Jobs', icon: 'clock' as const },
]

export async function loader({ request }: LoaderFunctionArgs) {
	// Require admin role to access admin routes
	await requireUserWithRole(request, 'admin')

	return json({})
}

export default function AdminLayout() {
	const location = useLocation()

	return (
		<div className="container-fluid mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-3xl font-bold">Admin Dashboard</h1>
				<Link
					to="/"
					className="flex items-center rounded-md bg-muted px-3 py-2 text-sm hover:bg-muted/80"
				>
					<Icon name="arrow-left" className="mr-2 h-4 w-4" />
					Back to Site
				</Link>
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-[250px_1fr]">
				{/* Admin navigation sidebar */}
				<div className="rounded-lg border bg-card p-4 shadow">
					<nav className="space-y-1">
						{adminMenuItems.map(item => {
							const isActive =
								location.pathname === item.path ||
								(item.path !== '/admin' &&
									location.pathname.startsWith(`${item.path}/`))

							return (
								<Link
									key={item.path}
									to={item.path}
									className={`flex items-center rounded-md px-3 py-2 transition-colors ${
										isActive
											? 'bg-primary text-primary-foreground'
											: 'hover:bg-muted'
									}`}
								>
									<Icon
										name={item.icon}
										className={`mr-2 h-5 w-5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}
									/>
									<span>{item.label}</span>
								</Link>
							)
						})}
					</nav>
				</div>

				{/* Content area */}
				<div>
					<Outlet />
				</div>
			</div>
		</div>
	)
}

// Add an error boundary component to handle permission errors
export function ErrorBoundary() {
	const error = useRouteError()

	if (isRouteErrorResponse(error) && error.status === 403) {
		return (
			<div className="container-fluid mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-destructive">
					<h1 className="mb-4 text-xl font-bold">Access Denied</h1>
					<p>You don't have permission to access the admin area.</p>
					<p className="mt-2">Required role: admin</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => (window.location.href = '/')}
					>
						Return to Home
					</Button>
				</div>
			</div>
		)
	}

	// For any other type of error
	return (
		<div className="container-fluid mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
			<div className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-destructive">
				<h1 className="mb-4 text-xl font-bold">Error</h1>
				<p>
					An unexpected error occurred in the admin area. Please try again
					later.
				</p>
				<Button
					variant="outline"
					className="mt-4"
					onClick={() => (window.location.href = '/')}
				>
					Return to Home
				</Button>
			</div>
		</div>
	)
}
