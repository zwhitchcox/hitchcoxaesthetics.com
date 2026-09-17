/**
 * The pages of the admin section. Used by the admin sidebar (desktop) and by
 * the site menu, which shows them only under /admin and only to an admin.
 */
export const adminMenuItems = [
	{ path: '/admin', label: 'Dashboard', icon: 'dashboard' as const },
	// The report hub serves its own full document, needs a real page load.
	{
		path: '/admin/reports',
		label: 'Reports',
		icon: 'dashboard' as const,
		reloadDocument: true,
	},
	{ path: '/admin/reviews', label: 'Reviews', icon: 'star' as const },
	{
		path: '/admin/review-links',
		label: 'Review Links',
		icon: 'link-2' as const,
	},
	{ path: '/admin/boulevard', label: 'Boulevard', icon: 'calendar' as const },
	{ path: '/admin/bg', label: 'Background Jobs', icon: 'clock' as const },
	{ path: '/admin/google-ads', label: 'Google Ads', icon: 'update' as const },
	{ path: '/admin/call-tags', label: 'Call Tags', icon: 'phone' as const },
	{ path: '/admin/follow-ups', label: 'Follow-ups', icon: 'check' as const },
	{ path: '/admin/outreach', label: 'Outreach', icon: 'file-text' as const },
	{ path: '/admin/facts', label: 'Facts', icon: 'list-bullet' as const },
	{ path: '/admin/podcast', label: 'Podcast', icon: 'camera' as const },
]
