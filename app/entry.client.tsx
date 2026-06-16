import { RemixBrowser } from '@remix-run/react'
import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'

startTransition(function () {
	hydrateRoot(document, <RemixBrowser />)
})
