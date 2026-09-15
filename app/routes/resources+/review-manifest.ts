import { json } from '@remix-run/node'

/**
 * The web app manifest for /review, so "Add to Home Screen" opens the
 * review page in one tap, in its own window. The global manifest starts at
 * "/", which would open the marketing site. root.tsx links this one on
 * /review paths. No scope is set on purpose: the sign-in pages must stay
 * inside the home-screen app, or it never gets the session cookie.
 *
 * Public: it holds only these strings, and the browser fetches it before
 * she signs in.
 */
export function loader() {
	return json(
		{
			name: 'Article review',
			short_name: 'Review',
			start_url: '/review',
			display: 'standalone',
			background_color: '#ffffff',
			theme_color: '#ffffff',
			icons: [
				{
					src: '/favicons/apple-touch-icon.png',
					sizes: '180x180',
					type: 'image/png',
				},
				{
					src: '/favicons/favicon-32x32.png',
					sizes: '32x32',
					type: 'image/png',
				},
				{ src: '/favicons/logo.svg', sizes: 'any', type: 'image/svg+xml' },
			],
		},
		{
			headers: {
				'Content-Type': 'application/manifest+json',
				'Cache-Control': 'public, max-age=86400',
			},
		},
	)
}
