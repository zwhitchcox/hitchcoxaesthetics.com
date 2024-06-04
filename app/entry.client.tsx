import { RemixBrowser } from '@remix-run/react'
import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'

if (ENV.MODE === 'production' && ENV.SENTRY_DSN) {
	import('./utils/monitoring.client.tsx').then(({ init }) => init())
}
if (ENV.MODE !== 'development' && ENV.GTM_ID) {
	;(function (w, d, s, l, i) {
		// @ts-ignore
		w[l] = w[l] || []
		// @ts-ignore
		w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' })
		var f = d.getElementsByTagName(s)[0],
			j = d.createElement(s),
			dl = l != 'dataLayer' ? '&l=' + l : ''
		// @ts-ignore
		j.async = true
		// @ts-ignore
		j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl
		// @ts-ignore
		f.parentNode.insertBefore(j, f)
	})(window, document, 'script', 'dataLayer', 'GTM-MP2TD9N3')
}

startTransition(() => {
	hydrateRoot(document, <RemixBrowser />)
})
