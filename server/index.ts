import crypto from 'crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequestHandler as _createRequestHandler } from '@remix-run/express'
import { installGlobals, type ServerBuild } from '@remix-run/node'
import { ip as ipAddress } from 'address'
import chalk from 'chalk'
import closeWithGrace from 'close-with-grace'
import compression from 'compression'
import express from 'express'
import rateLimit from 'express-rate-limit'
import getPort, { portNumbers } from 'get-port'
import helmet from 'helmet'
import morgan from 'morgan'

installGlobals()

const MODE = process.env.NODE_ENV ?? 'development'
const IS_PROD = MODE === 'production'
const IS_DEV = MODE === 'development'

const createRequestHandler = _createRequestHandler

const viteDevServer = IS_PROD
	? undefined
	: await import('vite').then(vite =>
			vite.createServer({
				server: { middlewareMode: true },
			}),
		)

const app = express()

// Override console.error for specific warning
const originalError = console.error.bind(console.error)
console.error = msg => {
	if (
		msg?.startsWith?.('Warning: useLayoutEffect does nothing on the server')
	) {
		return
	}
	originalError(msg)
}

const getHost = (req: { get: (key: string) => string | undefined }) =>
	req.get('X-Forwarded-Host') ?? req.get('host') ?? ''

// fly is our proxy
app.set('trust proxy', true)

// ensure HTTPS only (X-Forwarded-Proto comes from Fly)
app.use((req, res, next) => {
	const proto = req.get('X-Forwarded-Proto')
	const host = getHost(req)
	if (proto === 'http') {
		res.set('X-Forwarded-Proto', 'https')
		res.redirect(`https://${host}${req.originalUrl}`)
		return
	}
	next()
})

// Bought-domain microsites (expired domains rebuilt for their backlinks)
// served straight from this server, one prebuilt static bundle per host in
// network-sites/. Must run BEFORE the trailing-slash and alternate-domain
// redirects so those never touch these hosts.
const NETWORK_SITES = new Set([
	'mesolaserclinic.com',
	'abellamedspa.com',
	'agelessyoumedspa.com',
	'antiagingpress.org',
	'safecosmeticsalliance.org',
	'testandoprodutoscosmeticos.com',
	'cosmeticcrave.com',
	'temanaskincare.com',
	'xceleratedweightloss.com',
])
/**
 * Editorial links earned by these domains before we owned them point at post
 * URLs that no longer exist. A 404 passes nothing, so each legacy URL that
 * still has real inbound links is mapped to the article covering the same
 * subject. Verified against DataForSEO on 2026-08-02; the linking page is
 * noted so the mapping can be re-checked.
 */
const LEGACY_REDIRECTS: Record<string, Record<string, string>> = {
	'cosmeticcrave.com': {
		// buzzfeed.com (DA 61), a hand-cream review -> our hand-care guide
		'/2013/03/review-soap-and-glory-hand-food.html':
			'https://hitchcoxaesthetics.com/blog/hand-cream-and-hand-aging',
		// cosmopolitan.com (DA 52), a product round-up -> how to read a label
		'/2013/08/monthly-favourites-july.html':
			'https://hitchcoxaesthetics.com/blog/how-to-read-a-skincare-label',
		// low-value giveaway post stays on-site
		'/2013/07/international-giveaway-1000-followers-1.html': '/guides/',
		// These two guides were replaced by articles on our own blog; the
		// guides index no longer lists them.
		'/guides/hand-creams-what-actually-works/':
			'https://hitchcoxaesthetics.com/blog/hand-cream-and-hand-aging',
		'/guides/how-to-judge-a-beauty-product/':
			'https://hitchcoxaesthetics.com/blog/how-to-read-a-skincare-label',
	},
	'xceleratedweightloss.com': {
		// Three fda.gov public notifications (dofollow) all link the homepage.
		// Zane's call 2026-08-04: send them to the warning article on our blog
		// rather than hosting it here. Deeper pages on this domain still serve.
		'/': 'https://hitchcoxaesthetics.com/blog/xcelerated-weight-loss-fda-warning',
	},
	'safecosmeticsalliance.org': {
		// lifestyle.howstuffworks.com (DA 51), a cosmetics-history article.
		// Keyed with its query string; other objectid values still serve
		// index.cfm on-site.
		'/index.cfm?objectid=EE203500-D4DB-11E1-A38E000C296BA163':
			'https://hitchcoxaesthetics.com/blog/a-brief-history-of-cosmetics',
	},
	'testandoprodutoscosmeticos.com': {
		// areademulher.r7.com (DA 55) is Portuguese-language; keep the visitor
		// on a Portuguese page rather than sending them to an English site.
		'/2020/11/cor-de-cabelo-ruivo-dourado.html':
			'/artigos/rotina-de-cuidados-sem-mitos/',
		'/2011/10/sorteio-testando-e-sigma.html': '/artigos/',
		'/2012/03/sorteio-mascara-de-tratamento-nutri.html': '/artigos/',
		'/2012/04/sorteio-agua-thermal-aguas-de-sao-pedro.html': '/artigos/',
	},
}

app.use((req, res, next) => {
	const host = getHost(req).toLowerCase().split(':')[0]!.replace(/^www\./, '')
	if (!NETWORK_SITES.has(host)) return next()
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		return res.status(405).end()
	}
	const decodedPath = decodeURIComponent(req.path)
	const legacyMap = LEGACY_REDIRECTS[host]
	// Match the full URL first (some legacy CMS URLs differ only by query
	// string), then the path, tolerating a missing trailing slash.
	const legacy =
		legacyMap?.[decodeURIComponent(req.originalUrl)] ??
		legacyMap?.[decodedPath] ??
		legacyMap?.[`${decodedPath.replace(/\/+$/, '')}/`]
	if (legacy) return res.redirect(301, legacy)
	const root = path.join(process.cwd(), 'network-sites', host)
	const reqPath = decodedPath.replace(/\/+$/, '') || '/'
	const candidates =
		reqPath === '/'
			? ['index.html']
			: [reqPath, `${reqPath}.html`, `${reqPath}/index.html`]
	for (const candidate of candidates) {
		const filePath = path.join(root, candidate)
		// join() collapses "..", so a candidate escaping root lands outside it.
		if (!filePath.startsWith(root + path.sep)) continue
		if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
			// Legacy extensions from old sites (.cfm, .html-as-dir) carry no
			// known mime type; they are all HTML.
			if (/\.(cfm|php)$/.test(filePath)) res.type('html')
			return res.sendFile(filePath)
		}
	}
	// Old WordPress asset URLs we do not host (hotlinks from other sites):
	// redirect to the article index rather than 404. Files we DO host under
	// /wp-content are served by the loop above, so our own pages keep their
	// assets on this server.
	if (/^\/wp-content\//.test(req.path)) {
		const home = host === 'testandoprodutoscosmeticos.com' ? '/artigos/' : '/'
		return res.redirect(301, home)
	}
	const notFound = path.join(root, '404.html')
	if (fs.existsSync(notFound)) return res.status(404).sendFile(notFound)
	return res.status(404).send('Not found')
})

// no ending slashes for SEO reasons
// https://github.com/epicweb-dev/epic-stack/discussions/108
app.get('*', (req, res, next) => {
	if (req.path.endsWith('/') && req.path.length > 1) {
		const query = req.url.slice(req.path.length)
		const safepath = req.path.slice(0, -1).replace(/\/+/g, '/')
		res.redirect(302, safepath + query)
	} else {
		next()
	}
})

// redirect alternate domains to hitchcoxaesthetics.com
app.get('*', (req, res, next) => {
	const host = getHost(req)
	if (
		host === 'www.hitchcoxaesthetics.com' ||
		host === 'hitchcoxaesthetics.pharmacy' ||
		host === 'www.hitchcoxaesthetics.pharmacy'
	) {
		const newUrl = `https://hitchcoxaesthetics.com${req.originalUrl}`
		return res.redirect(301, newUrl)
	}
	next()
})

// The Botox Knox brand is its own site; its alternate domain must not touch
// hitchcoxaesthetics.com. Send it to the brand's canonical domain.
app.get('*', (req, res, next) => {
	const host = getHost(req)
	if (
		host === 'botoxknoxville.com' ||
		host === 'www.botoxknoxville.com' ||
		host === 'www.botoxknoxvilletn.com'
	) {
		return res.redirect(301, `https://botoxknoxvilletn.com${req.originalUrl}`)
	}
	next()
})

// Redirect book.hitchcoxaesthetics.com to the Boulevard booking widget
app.use((req, res, next) => {
	if (getHost(req) === 'book.hitchcoxaesthetics.com') {
		return res.redirect(
			301,
			'https://www.joinblvd.com/b/sarahhitchcox/widget#/locations',
		)
	}
	next()
})

app.use(compression())

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable('x-powered-by')

if (viteDevServer) {
	app.use(viteDevServer.middlewares)
} else {
	// Remix fingerprints its assets so we can cache forever.
	app.use(
		'/assets',
		express.static('build/client/assets', { immutable: true, maxAge: '1y' }),
	)

	// Everything else (like favicon.ico) is cached for an hour. You may want to be
	// more aggressive with this caching.
	app.use(express.static('build/client', { maxAge: '1h' }))
}

app.get(['/img/*', '/favicons/*'], (_req, res) => {
	// if we made it past the express.static for these, then we're missing something.
	// So we'll just send a 404 and won't bother calling other middleware.
	return res.status(404).send('Not found')
})

morgan.token('url', req => decodeURIComponent(req.url ?? ''))
app.use(
	morgan('tiny', {
		skip: (req, res) =>
			res.statusCode === 200 &&
			(req.url?.startsWith('/resources/note-images') ||
				req.url?.startsWith('/resources/user-images') ||
				req.url?.startsWith('/resources/healthcheck')),
	}),
)

app.use((_, res, next) => {
	res.locals.cspNonce = crypto.randomBytes(16).toString('hex')
	next()
})

app.use(
	helmet({
		xPoweredBy: false,
		referrerPolicy: { policy: 'same-origin' },
		crossOriginEmbedderPolicy: false,
		contentSecurityPolicy: {
			// NOTE: Remove reportOnly when you're ready to enforce this CSP
			reportOnly: true,
			directives: {
				'connect-src': [
					MODE === 'development' ? 'ws:' : null,
					'https://*.googleapis.com',
					'*.google.com',
					'https://*.gstatic.com',
					'https://*.google-analytics.com',
					'https://www.googleadservices.com',
					'*.posthog.com',
					"'self'",
				].filter(Boolean),
				'font-src': ["'self'", 'https://*.gstatic.com'],
				'frame-src': [
					"'self'",
					'https://*.google.com',
					'https://td.doubleclick.net',
				],
				'img-src': [
					"'self'",
					'data:',
					'https://*.googleapis.com',
					'https://*.gstatic.com',
					'https://*.google.com',
					'https://*.googleusercontent.com',
					'https://*.googletagmanager.com',
					// OpenStreetMap tiles for the /geo-rank Leaflet map
					'https://*.tile.openstreetmap.org',
				],
				'script-src': [
					"'strict-dynamic'",
					"'self'",
					// @ts-expect-error
					(_, res) => `'nonce-${res.locals.cspNonce}'`,
					'https://*.googleapis.com',
					'https://*.googletagmanager.com',
					'https://*.posthog.com',
				],
				'script-src-elem': [
					"'self'",
					// @ts-expect-error
					(_, res) => `'nonce-${res.locals.cspNonce}'`,
					'https://*.googleapis.com',
					'https://*.gstatic.com',
					'https://*.google.com',
					'https://*.googleusercontent.com',
					'https://*.googletagmanager.com',
					'https://googleads.g.doubleclick.net',
					'http://www.gstatic.com',
					'https://*.posthog.com',
					// Leaflet CDN (/geo-rank) + CallRail number-swap script
					'https://unpkg.com',
					'https://cdn.callrail.com',
				],
				'script-src-attr': [
					// @ts-expect-error
					(_, res) => `'nonce-${res.locals.cspNonce}'`,
				],
				'upgrade-insecure-requests': null,
			},
		},
	}),
)

// When running tests or running in development, we want to effectively disable
// rate limiting because playwright tests are very fast and we don't want to
// have to wait for the rate limit to reset between tests.
const maxMultiple =
	!IS_PROD || process.env.PLAYWRIGHT_TEST_BASE_URL ? 10_000 : 1
const rateLimitDefault = {
	windowMs: 60 * 1000,
	max: 1000 * maxMultiple,
	standardHeaders: true,
	legacyHeaders: false,
	// Fly.io prevents spoofing of X-Forwarded-For
	// so no need to validate the trustProxy config
	validate: { trustProxy: false },
}

const strongestRateLimit = rateLimit({
	...rateLimitDefault,
	windowMs: 60 * 1000,
	max: 10 * maxMultiple,
})

const strongRateLimit = rateLimit({
	...rateLimitDefault,
	windowMs: 60 * 1000,
	max: 100 * maxMultiple,
})

const generalRateLimit = rateLimit(rateLimitDefault)
app.use((req, res, next) => {
	const strongPaths = [
		'/auth',
		'/signup',
		'/verify',
		'/admin',
		'/onboarding',
		'/reset-password',
		'/settings/profile',
		'/resources/login',
		'/resources/verify',
	]
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		if (strongPaths.some(p => req.path.includes(p))) {
			return strongestRateLimit(req, res, next)
		}
		return strongRateLimit(req, res, next)
	}

	// the verify route is a special case because it's a GET route that
	// can have a token in the query string
	if (req.path.includes('/verify')) {
		return strongestRateLimit(req, res, next)
	}

	return generalRateLimit(req, res, next)
})

async function getBuild() {
	const build = viteDevServer
		? viteDevServer.ssrLoadModule('virtual:remix/server-build')
		: // @ts-ignore this should exist before running the server
			// but it may not exist just yet.
			await import('#build/server/index.js')
	// not sure how to make this happy 🤷‍♂️
	return build as unknown as ServerBuild
}

app.all(
	'*',
	createRequestHandler({
		getLoadContext: (_: any, res: any) => ({
			cspNonce: res.locals.cspNonce,
			serverBuild: getBuild(),
		}),
		mode: MODE,
		build: getBuild,
	}),
)

const desiredPort = Number(process.env.PORT || 4000)
const portToUse = await getPort({
	port: portNumbers(desiredPort, desiredPort + 100),
})
const portAvailable = desiredPort === portToUse
if (!portAvailable && !IS_DEV) {
	console.log(`⚠️ Port ${desiredPort} is not available.`)
	process.exit(1)
}

const server = app.listen(portToUse, () => {
	if (!portAvailable) {
		console.warn(
			chalk.yellow(
				`⚠️  Port ${desiredPort} is not available, using ${portToUse} instead.`,
			),
		)
	}
	console.log(`🚀  We have liftoff!`)
	const localUrl = `http://localhost:${portToUse}`
	let lanUrl: string | null = null
	const localIp = ipAddress() ?? 'Unknown'
	// Check if the address is a private ip
	// https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
	// https://github.com/facebook/create-react-app/blob/d960b9e38c062584ff6cfb1a70e1512509a966e7/packages/react-dev-utils/WebpackDevServerUtils.js#LL48C9-L54C10
	if (/^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(localIp)) {
		lanUrl = `http://${localIp}:${portToUse}`
	}

	console.log(
		`
${chalk.bold('Local:')}            ${chalk.cyan(localUrl)}
${lanUrl ? `${chalk.bold('On Your Network:')}  ${chalk.cyan(lanUrl)}` : ''}
${chalk.bold('Press Ctrl+C to stop')}
		`.trim(),
	)
})

closeWithGrace(async () => {
	await new Promise((resolve, reject) => {
		server.close(e => (e ? reject(e) : resolve('ok')))
	})
})
