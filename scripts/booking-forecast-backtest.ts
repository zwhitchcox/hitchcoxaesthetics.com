/**
 * Booking-arrival forecast backtest ("hot" model).
 *
 * Models bookings/hour as
 *   level × dow-factor × hour-factor × trend(h) × burst^decay(h)
 * where `burst` compares recency-weighted recent bookings to what the
 * baseline expected (Reddit-hot style), and its influence decays with the
 * forecast horizon h, so "the next 4 hours" feels a burst fully while a day
 * two months out reverts to the trend-adjusted average.
 *
 * Walk-forward backtest over the post-Boulevard-migration booking history,
 * grid-searching the decay parameters on a train window and scoring the
 * winner on a holdout, against flat / seasonal / no-burst / naive baselines.
 *
 *   pnpm exec tsx scripts/blvd-pull-booking-times.ts /path/to/bookings.json
 *   pnpm exec tsx scripts/booking-forecast-backtest.ts /path/to/bookings.json
 *
 * Input rows: { createdAt, ... } per appointment (cancelled ones included:
 * a booking later cancelled was still demand when it was made).
 */
import fs from 'node:fs'

// ---------------------------------------------------------------- calendar

const HOUR_MS = 3600_000
/** Series start: after the Jane-import spike (Mar 19) AND the migration-week
 * cleanup (staff bulk re-entered the prior week's book through Mar 24). */
const SERIES_START = Date.parse('2026-03-25T00:00:00Z')

const etFmt = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/New_York',
	hour12: false,
	weekday: 'short',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: 'numeric',
})
const DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type HourMeta = {
	/** ET calendar day, YYYY-MM-DD. */
	day: string
	dow: number
	hour: number
	weekend: boolean
}

function etMeta(ms: number): HourMeta {
	const p = Object.fromEntries(
		etFmt.formatToParts(ms).map(x => [x.type, x.value]),
	) as Record<string, string>
	const dow = DOWS.indexOf(p.weekday!)
	return {
		day: `${p.year}-${p.month}-${p.day}`,
		dow,
		hour: Number(p.hour) % 24,
		weekend: dow >= 5,
	}
}

// ------------------------------------------------------------------ model

type Params = {
	/** Burst recency half-life, DAYS (weights completed days, newest first). */
	burstHl: number
	/** Burst→baseline horizon decay constant τ, DAYS. */
	tau: number
	/** Burst prior strength, pseudo-bookings. */
	k: number
	/** Level/profile half-life, days. */
	profHl: number
	/** Trend damping 0..1. */
	trendDamp: number
	/** DOW×hour refinement prior strength, pseudo-hours (1e9 = off). */
	cellP: number
	/** Burst gain: fraction of the log-deviation applied at lead 0. The daily
	 * residual autocorr is ~0.2, so full-strength (1.0) always overshoots. */
	gain: number
	/** Day-of-month (payday) factor prior strength, pseudo-bookings (1e9 = off). */
	domP: number
}

/** Day-of-month → payday-cycle bucket (5-day bands; 31st joins 26+). */
function domBucket(day: string) {
	return Math.min(5, Math.floor((Number(day.slice(8, 10)) - 1) / 5))
}

const TREND_FAST_HL_D = 10
const TREND_SLOW_HL_D = 35
/** Day-of-month factor decay: slow, it needs several monthly cycles. */
const DOM_HL_D = 70
const BURST_CLAMP: [number, number] = [0.3, 3.5]
/** Max daily growth rate the trend may claim (~±35%/month). */
const TREND_BETA_CLAMP = 0.01
const TREND_H_CAP_D = 90

/** Decayed (sum, weight) pair with lazy decay. */
class Decayed {
	sum = 0
	w = 0
	private lastT = 0
	constructor(private readonly hlHours: number) {}
	private decayTo(t: number) {
		if (t > this.lastT && this.w > 0) {
			const dtHours = (t - this.lastT) / HOUR_MS
			const f = 2 ** (-dtHours / this.hlHours)
			this.sum *= f
			this.w *= f
		}
		this.lastT = Math.max(this.lastT, t)
	}
	add(t: number, x: number, w = 1) {
		this.decayTo(t)
		this.sum += x
		this.w += w
	}
	/** sum/w after decaying to time t; fallback when no weight yet. */
	rate(t: number, fallback = 0) {
		this.decayTo(t)
		return this.w > 0 ? this.sum / this.w : fallback
	}
	read(t: number) {
		this.decayTo(t)
		return { sum: this.sum, w: this.w }
	}
}

/**
 * Streaming model state. Feed hours in order with observe(); forecast() any
 * time between observes, using only what came before.
 */
class HotModel {
	private level: Decayed
	private fast: Decayed
	private slow: Decayed
	private dowN: Decayed[]
	private dowW: Decayed[]
	private hourN: Decayed[][]
	private hourW: Decayed[][]
	private cellN: Decayed[][]
	private cellW: Decayed[][]
	private burstA: Decayed
	private burstE: Decayed

	constructor(private readonly p: Params) {
		const profHlH = p.profHl * 24
		this.level = new Decayed(profHlH)
		this.fast = new Decayed(TREND_FAST_HL_D * 24)
		this.slow = new Decayed(TREND_SLOW_HL_D * 24)
		this.dowN = DOWS.map(() => new Decayed(profHlH))
		this.dowW = DOWS.map(() => new Decayed(profHlH))
		this.hourN = [0, 1].map(() =>
			Array.from({ length: 24 }, () => new Decayed(profHlH)),
		)
		this.hourW = [0, 1].map(() =>
			Array.from({ length: 24 }, () => new Decayed(profHlH)),
		)
		this.cellN = DOWS.map(() =>
			Array.from({ length: 24 }, () => new Decayed(profHlH)),
		)
		this.cellW = DOWS.map(() =>
			Array.from({ length: 24 }, () => new Decayed(profHlH)),
		)
		this.burstA = new Decayed(p.burstHl * 24)
		this.burstE = new Decayed(p.burstHl * 24)
		this.domA = Array.from({ length: 6 }, () => new Decayed(DOM_HL_D * 24))
		this.domE = Array.from({ length: 6 }, () => new Decayed(DOM_HL_D * 24))
	}
	private domA: Decayed[]
	private domE: Decayed[]

	/** Today-so-far accumulators; folded into the burst at day rollover so the
	 * burst only ever compares COMPLETED days (the intraday morning/afternoon
	 * seesaw would otherwise cancel the real day-over-day momentum). */
	private todayKey: string | null = null
	private todayA = 0
	private todayE = 0

	/** Baseline bookings/hour before the day-of-month factor. */
	private basePreDom(t: number, meta: HourMeta) {
		const lvl = this.level.rate(t)
		if (lvl <= 0) return 0
		// Factors shrink toward 1 with pseudo-weight so thin cells stay tame.
		const PSEUDO_H = 72
		const dowCell = this.dowN[meta.dow]!.read(t)
		const dowAll = this.dowW[meta.dow]!.read(t)
		const dowFactor =
			(dowCell.sum + PSEUDO_H * lvl) / ((dowAll.sum + PSEUDO_H) * lvl || 1)
		const we = meta.weekend ? 1 : 0
		const hCell = this.hourN[we]![meta.hour]!.read(t)
		const hAll = this.hourW[we]![meta.hour]!.read(t)
		const hourFactor =
			(hCell.sum + PSEUDO_H * lvl) / ((hAll.sum + PSEUDO_H) * lvl || 1)
		const base0 = lvl * dowFactor * hourFactor
		// DOW×hour refinement: the cell's own decayed rate, shrunk toward the
		// coarse product with cellP pseudo-hours of prior weight.
		const cN = this.cellN[meta.dow]![meta.hour]!.read(t)
		const cW = this.cellW[meta.dow]![meta.hour]!.read(t)
		return (cN.sum + this.p.cellP * base0) / (cW.sum + this.p.cellP || 1)
	}

	/** Payday-cycle multiplier for the target day, shrunk toward 1. */
	private domFactor(t: number, day: string) {
		const b = domBucket(day)
		const a = this.domA[b]!.read(t)
		const e = this.domE[b]!.read(t)
		return (a.sum + this.p.domP) / (e.sum + this.p.domP || 1)
	}

	private baseRate(t: number, meta: HourMeta) {
		return this.basePreDom(t, meta) * this.domFactor(t, meta.day)
	}

	observe(t: number, meta: HourMeta, n: number) {
		// The dom factor learns against the PRE-dom baseline; the burst learns
		// against the dom-adjusted one so it never re-learns paydays.
		const mu0 = this.basePreDom(t, meta)
		const b = domBucket(meta.day)
		const mu = mu0 * this.domFactor(t, meta.day)
		this.domA[b]!.add(t, n)
		this.domE[b]!.add(t, mu0)
		if (this.todayKey !== null && meta.day !== this.todayKey) {
			this.burstA.add(t, this.todayA)
			this.burstE.add(t, this.todayE)
			this.todayA = 0
			this.todayE = 0
		}
		this.todayKey = meta.day
		this.todayA += n
		this.todayE += mu

		this.level.add(t, n)
		this.fast.add(t, n)
		this.slow.add(t, n)
		this.dowN[meta.dow]!.add(t, n)
		this.dowW[meta.dow]!.add(t, 1)
		const we = meta.weekend ? 1 : 0
		this.hourN[we]![meta.hour]!.add(t, n)
		this.hourW[we]![meta.hour]!.add(t, 1)
		this.cellN[meta.dow]![meta.hour]!.add(t, n)
		this.cellW[meta.dow]![meta.hour]!.add(t, 1)
	}

	/** Damped exponential daily growth rate from the fast/slow level ratio. */
	private trendBeta(t: number) {
		const f = this.fast.rate(t)
		const s = this.slow.rate(t)
		if (f <= 0 || s <= 0) return 0
		// Mean age of an exp-decayed window is HL/ln2; the ratio spans that gap.
		const gapDays = (TREND_SLOW_HL_D - TREND_FAST_HL_D) / Math.LN2
		const beta = Math.log(f / s) / gapDays
		return Math.max(-TREND_BETA_CLAMP, Math.min(TREND_BETA_CLAMP, beta)) *
			this.p.trendDamp
	}

	private burst(t: number) {
		const a = this.burstA.read(t)
		const e = this.burstE.read(t)
		const b = (a.sum + this.p.k) / (e.sum + this.p.k)
		return Math.max(BURST_CLAMP[0], Math.min(BURST_CLAMP[1], b))
	}

	/** Expected bookings in target hour `u` (ms), seen from origin `t0`. */
	forecastHour(t0: number, u: number, meta: HourMeta) {
		const hDays = Math.max(0, (u - t0) / HOUR_MS) / 24
		const base = this.baseRate(t0, meta)
		const beta = this.trendBeta(t0)
		const trend = Math.exp(beta * Math.min(hDays, TREND_H_CAP_D))
		const burstPow = this.p.gain * Math.exp(-hDays / this.p.tau)
		return base * trend * this.burst(t0) ** burstPow
	}

	snapshot(t0: number) {
		return { burst: this.burst(t0), beta: this.trendBeta(t0), level: this.level.rate(t0) }
	}
}

// -------------------------------------------------------------- backtest

type Row = { createdAt: string; startAt: string }

function loadHourly(file: string) {
	const rows = JSON.parse(fs.readFileSync(file, 'utf8')) as Row[]
	const times = rows
		// A row created over an hour AFTER its own start time is staff
		// data-entry (recording something that already happened), not a booking.
		.filter(r => Date.parse(r.createdAt) <= Date.parse(r.startAt) + HOUR_MS)
		.map(r => Date.parse(r.createdAt))
		.filter(t => Number.isFinite(t) && t >= SERIES_START)
		.sort((a, b) => a - b)
	const end = Math.floor(Date.now() / HOUR_MS) * HOUR_MS // last complete hour
	const h0 = Math.floor(SERIES_START / HOUR_MS)
	const nHours = Math.floor(end / HOUR_MS) - h0
	const counts = new Array<number>(nHours).fill(0)
	for (const t of times) {
		const i = Math.floor(t / HOUR_MS) - h0
		if (i >= 0 && i < nHours) counts[i]!++
	}
	const meta: HourMeta[] = Array.from({ length: nHours }, (_, i) =>
		etMeta((h0 + i) * HOUR_MS),
	)
	// ET day → hour indices + actual counts, for day-bucket targets.
	const dayHours = new Map<string, number[]>()
	for (let i = 0; i < nHours; i++) {
		const d = meta[i]!.day
		if (!dayHours.has(d)) dayHours.set(d, [])
		dayHours.get(d)!.push(i)
	}
	const dayCount = new Map<string, number>()
	for (const [d, hs] of dayHours)
		dayCount.set(d, hs.reduce((s, i) => s + counts[i]!, 0))
	return { h0, nHours, counts, meta, dayHours, dayCount }
}

type Series = ReturnType<typeof loadHourly>

const WARMUP_DAYS = 28
const ORIGIN_STEP_H = 4
const DAY_LEADS = [1, 3, 7, 14, 30, 56]

type Score = { n: number; absErr: number; sqErr: number; dev: number; pred: number; act: number }
const newScore = (): Score => ({ n: 0, absErr: 0, sqErr: 0, dev: 0, pred: 0, act: 0 })
function scoreAdd(s: Score, pred: number, act: number) {
	const mu = Math.max(pred, 1e-9)
	s.n++
	s.absErr += Math.abs(pred - act)
	s.sqErr += (pred - act) ** 2
	s.dev += 2 * ((act > 0 ? act * Math.log(act / mu) : 0) - (act - mu))
	s.pred += pred
	s.act += act
}

type HorizonKey = 'next4h' | `d${number}`
const HORIZONS: HorizonKey[] = ['next4h', ...DAY_LEADS.map(l => `d${l}` as const)]

/**
 * One walk over the series for one parameter set. Returns per-horizon scores
 * for train and holdout origin sets. `variant` lets baselines reuse the walk:
 *   full     – the whole model
 *   noburst  – level/profile/trend only
 *   seasonal – level/profile only
 */
function runModel(
	series: Series,
	p: Params,
	splitMs: number,
	variant: 'full' | 'noburst' | 'seasonal' = 'full',
) {
	const { h0, nHours, counts, meta, dayHours } = series
	const eff: Params =
		variant === 'full'
			? p
			: { ...p, k: 1e9, trendDamp: variant === 'noburst' ? p.trendDamp : 0 }
	const model = new HotModel(eff)
	const train = new Map<HorizonKey, Score>(HORIZONS.map(h => [h, newScore()]))
	const hold = new Map<HorizonKey, Score>(HORIZONS.map(h => [h, newScore()]))
	const warmupEnd = SERIES_START + WARMUP_DAYS * 24 * HOUR_MS

	for (let i = 0; i < nHours; i++) {
		const t = (h0 + i) * HOUR_MS
		if (i % ORIGIN_STEP_H === 0 && t >= warmupEnd) {
			const bucket = t < splitMs ? train : hold
			// next 4 hours
			if (i + 4 <= nHours) {
				let pred = 0
				let act = 0
				for (let j = i; j < i + 4; j++) {
					pred += model.forecastHour(t, (h0 + j) * HOUR_MS, meta[j]!)
					act += counts[j]!
				}
				scoreAdd(bucket.get('next4h')!, pred, act)
			}
			// whole ET days at fixed leads
			const originDay = meta[i]!.day
			for (const lead of DAY_LEADS) {
				const targetDay = etMeta(t + lead * 24 * HOUR_MS).day
				if (targetDay === originDay) continue
				const hs = dayHours.get(targetDay)
				if (!hs || hs.length < 24) continue // partial/out-of-range day
				let pred = 0
				let act = 0
				for (const j of hs) {
					pred += model.forecastHour(t, (h0 + j) * HOUR_MS, meta[j]!)
					act += counts[j]!
				}
				scoreAdd(bucket.get(`d${lead}`)!, pred, act)
			}
		}
		model.observe(t, meta[i]!, counts[i]!)
	}
	return { train, hold }
}

/** Flat-rate and naive-seasonal baselines, same origins as runModel. */
function runNaive(series: Series, splitMs: number) {
	const { h0, nHours, counts, meta, dayHours, dayCount } = series
	const train = new Map<HorizonKey, Score>(HORIZONS.map(h => [h, newScore()]))
	const hold = new Map<HorizonKey, Score>(HORIZONS.map(h => [h, newScore()]))
	const flatTrain = new Map<HorizonKey, Score>(HORIZONS.map(h => [h, newScore()]))
	const flatHold = new Map<HorizonKey, Score>(HORIZONS.map(h => [h, newScore()]))
	const warmupEnd = SERIES_START + WARMUP_DAYS * 24 * HOUR_MS
	// trailing 28d sum for the flat baseline
	let rolling = 0
	const W = 28 * 24
	for (let i = 0; i < nHours; i++) {
		const t = (h0 + i) * HOUR_MS
		if (i % ORIGIN_STEP_H === 0 && t >= warmupEnd) {
			const buckets = t < splitMs ? [train, flatTrain] : [hold, flatHold]
			const perHour = rolling / Math.min(i, W)
			// next4h: naive = same 4h last week; flat = 4×perHour
			if (i + 4 <= nHours && i >= 168) {
				let act = 0
				let naive = 0
				for (let j = i; j < i + 4; j++) {
					act += counts[j]!
					naive += counts[j - 168]!
				}
				scoreAdd(buckets[0]!.get('next4h')!, naive, act)
				scoreAdd(buckets[1]!.get('next4h')!, perHour * 4, act)
			}
			const originDay = meta[i]!.day
			for (const lead of DAY_LEADS) {
				const targetDay = etMeta(t + lead * 24 * HOUR_MS).day
				if (targetDay === originDay) continue
				const hs = dayHours.get(targetDay)
				if (!hs || hs.length < 24) continue
				const act = dayCount.get(targetDay)!
				// naive: most recent fully-observed same-DOW day before origin
				let naiveDay: string | null = null
				for (let back = 7; back <= 35; back += 7) {
					const cand = etMeta(t + (lead - back) * 24 * HOUR_MS).day
					if (cand < originDay && dayCount.has(cand)) {
						naiveDay = cand
						break
					}
				}
				if (naiveDay) scoreAdd(buckets[0]!.get(`d${lead}`)!, dayCount.get(naiveDay)!, act)
				scoreAdd(buckets[1]!.get(`d${lead}`)!, perHour * 24, act)
			}
		}
		rolling += counts[i]!
		if (i >= W) rolling -= counts[i - W]!
	}
	return { naive: { train, hold }, flat: { train: flatTrain, hold: flatHold } }
}

// ------------------------------------------------------------------ main

function fmtScores(label: string, m: Map<HorizonKey, Score>) {
	const cells = HORIZONS.map(h => {
		const s = m.get(h)!
		if (!s.n) return `${h}: -`
		const mae = (s.absErr / s.n).toFixed(2)
		const bias = s.act > 0 ? (s.pred / s.act).toFixed(2) : '-'
		return `${h}: mae ${mae} bias ${bias}`
	})
	console.log(`${label.padEnd(26)} ${cells.join(' | ')}`)
}

function devTotal(m: Map<HorizonKey, Score>, ref: Map<HorizonKey, Score>) {
	// Sum of per-horizon deviance normalized by the reference model, so every
	// horizon counts equally no matter its scale.
	let tot = 0
	let n = 0
	for (const h of HORIZONS) {
		const s = m.get(h)!
		const r = ref.get(h)!
		if (!s.n || !r.n || r.dev <= 0) continue
		tot += s.dev / s.n / (r.dev / r.n)
		n++
	}
	return n ? tot / n : Infinity
}

/**
 * Is there burst signal at all? Pearson residuals of the seasonal model per
 * 4h block / per day, and their autocorrelation. If these sit near zero the
 * recent past carries no information the seasonal baseline doesn't already
 * have, and NO burst term can help.
 */
function residualDiagnostics(series: Series, p: Params) {
	const { h0, nHours, counts, meta } = series
	const model = new HotModel({ ...p, k: 1e9, trendDamp: 0 })
	const warmupEnd = SERIES_START + WARMUP_DAYS * 24 * HOUR_MS
	const blocks: Array<{ idx: number; r: number }> = []
	const byDay = new Map<string, { exp: number; act: number }>()
	let exp4 = 0
	let act4 = 0
	for (let i = 0; i < nHours; i++) {
		const t = (h0 + i) * HOUR_MS
		const mu = model.forecastHour(t, t, meta[i]!)
		if (t >= warmupEnd) {
			exp4 += mu
			act4 += counts[i]!
			if (i % 4 === 3) {
				if (exp4 >= 0.5)
					blocks.push({ idx: Math.floor(i / 4), r: (act4 - exp4) / Math.sqrt(exp4) })
				exp4 = 0
				act4 = 0
			}
			const d = meta[i]!.day
			const cell = byDay.get(d) ?? { exp: 0, act: 0 }
			cell.exp += mu
			cell.act += counts[i]!
			byDay.set(d, cell)
		}
		model.observe(t, meta[i]!, counts[i]!)
	}
	const corrAtLag = (xs: Array<{ idx: number; r: number }>, lag: number) => {
		const byIdx = new Map(xs.map(x => [x.idx, x.r]))
		const pairs: Array<[number, number]> = []
		for (const x of xs) {
			const y = byIdx.get(x.idx + lag)
			if (y !== undefined) pairs.push([x.r, y])
		}
		if (pairs.length < 30) return null
		const mx = pairs.reduce((s, p2) => s + p2[0], 0) / pairs.length
		const my = pairs.reduce((s, p2) => s + p2[1], 0) / pairs.length
		let sxy = 0
		let sxx = 0
		let syy = 0
		for (const [a, b] of pairs) {
			sxy += (a - mx) * (b - my)
			sxx += (a - mx) ** 2
			syy += (b - my) ** 2
		}
		return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
	}
	const rs = blocks.map(b => b.r)
	const mean = rs.reduce((a, b) => a + b, 0) / rs.length
	const varr = rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length
	console.log(
		`\n=== burst-signal diagnostics (seasonal residuals) ===\n` +
			`4h business blocks: n=${rs.length}, Pearson residual var ${varr.toFixed(2)} ` +
			`(1.00 = pure Poisson, higher = clumpier)`,
	)
	const lags4 = [1, 2, 3, 6, 12, 42]
	console.log(
		'4h-block residual autocorr: ' +
			lags4
				.map(l => `lag ${l * 4}h: ${corrAtLag(blocks, l)?.toFixed(3) ?? '-'}`)
				.join('  '),
	)
	const days = [...byDay.entries()]
		.filter(([, v]) => v.exp > 2)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, v], i) => ({ idx: i, r: (v.act - v.exp) / Math.sqrt(v.exp) }))
	const dayRs = days.map(d => d.r)
	const dmean = dayRs.reduce((a, b) => a + b, 0) / dayRs.length
	const dvar = dayRs.reduce((a, b) => a + (b - dmean) ** 2, 0) / dayRs.length
	console.log(
		`daily: n=${days.length}, residual var ${dvar.toFixed(2)}; autocorr ` +
			[1, 2, 3, 7, 14]
				.map(l => `lag ${l}d: ${corrAtLag(days, l)?.toFixed(3) ?? '-'}`)
				.join('  '),
	)
	// Pay-cycle sniff: mean daily residual by day-of-month bucket.
	const domBuckets = new Map<string, { s: number; n: number }>()
	const domDays = [...byDay.entries()].filter(([, v]) => v.exp > 2)
	for (const [day, v] of domDays) {
		const dom = Number(day.slice(8, 10))
		const key = `${String(Math.floor((dom - 1) / 5) * 5 + 1).padStart(2, '0')}+`
		const cell = domBuckets.get(key) ?? { s: 0, n: 0 }
		cell.s += (v.act - v.exp) / Math.sqrt(v.exp)
		cell.n++
		domBuckets.set(key, cell)
	}
	console.log(
		'mean daily residual by day-of-month: ' +
			[...domBuckets.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k2, v]) => `${k2}: ${(v.s / v.n).toFixed(2)}`)
				.join('  '),
	)
}

/**
 * Backtest winner (2026-08-03, 961 bookings Mar 25→Aug 3). The burst knobs are
 * kept but tuned to near-neutral: at ~8 bookings/day the recent-hours signal
 * is noise (daily residual autocorr ~0.19, hourly bursts don't carry
 * forward). Revisit gain/k when volume roughly triples.
 */
const TUNED: Params = {
	burstHl: 4, tau: 2, k: 2, gain: 0.15,
	profHl: 42, trendDamp: 0, cellP: 24, domP: 1e9,
}

/** Fit on everything and print a forward view from now. */
function liveForecast(series: Series) {
	const { h0, nHours, counts, meta } = series
	const model = new HotModel(TUNED)
	const flat = { sum: 0, n: 0 }
	for (let i = 0; i < nHours; i++) {
		model.observe((h0 + i) * HOUR_MS, meta[i]!, counts[i]!)
		if (i >= nHours - 28 * 24) {
			flat.sum += counts[i]!
			flat.n++
		}
	}
	const t0 = (h0 + nHours) * HOUR_MS
	const flatHour = flat.sum / flat.n
	const snap = model.snapshot(t0)
	console.log(
		`\n=== live forecast from ${new Date(t0).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET ===`,
	)
	console.log(
		`state: level ${(snap.level * 24).toFixed(1)}/day, burst ${snap.burst.toFixed(2)}, trend beta ${snap.beta.toFixed(4)}/day`,
	)
	const window = (fromH: number, toH: number) => {
		let s = 0
		for (let j = fromH; j < toH; j++)
			s += model.forecastHour(t0, (h0 + j) * HOUR_MS, etMeta((h0 + j) * HOUR_MS))
		return s
	}
	const line = (label: string, fromH: number, toH: number) =>
		console.log(
			`  ${label.padEnd(22)} model ${window(fromH, toH).toFixed(1).padStart(5)}   flat-avg ${(flatHour * (toH - fromH)).toFixed(1).padStart(5)}`,
		)
	line('next 4 hours', nHours, nHours + 4)
	const today = etMeta(t0).day
	let endOfDay = nHours
	while (etMeta((h0 + endOfDay) * HOUR_MS).day === today) endOfDay++
	line('rest of today', nHours, endOfDay)
	let cursor = endOfDay
	for (let d = 0; d < 7; d++) {
		const day = etMeta((h0 + cursor) * HOUR_MS).day
		let end = cursor
		while (etMeta((h0 + end) * HOUR_MS).day === day) end++
		line(`${day} (${DOWS[etMeta((h0 + cursor) * HOUR_MS).dow]})`, cursor, end)
		cursor = end
	}
	for (const lead of [14, 30, 60]) {
		const day = etMeta(t0 + lead * 24 * HOUR_MS).day
		let start = nHours + lead * 24 - 30
		while (etMeta((h0 + start) * HOUR_MS).day !== day) start++
		let end = start
		while (etMeta((h0 + end) * HOUR_MS).day === day) end++
		line(`+${lead}d (${day})`, start, end)
	}
}

async function main() {
	const file = process.argv[2]
	if (!file) throw new Error('usage: booking-forecast-backtest.ts <bookings.json> [--forecast]')
	const series = loadHourly(file)
	if (process.argv.includes('--forecast')) {
		liveForecast(series)
		process.exit(0)
	}
	const splitMs = Date.parse('2026-06-20T00:00:00Z')
	console.log(
		`hours: ${series.nHours}, bookings: ${series.counts.reduce((a, b) => a + b, 0)}, ` +
			`train origins < 2026-06-20 < holdout`,
	)

	const defaults: Params = {
		burstHl: 2, tau: 5, k: 4, profHl: 28, trendDamp: 0.5, cellP: 96,
		gain: 0.3, domP: 20,
	}
	const seasonalRef = runModel(series, defaults, splitMs, 'seasonal')

	// ---- grid search on train (burstHl and tau are in DAYS)
	const grid: Params[] = []
	for (const burstHl of [0.75, 2, 4])
		for (const tau of [2, 7])
			for (const k of [2])
				for (const gain of [0.15, 0.35, 0.7, 1])
					for (const profHl of [21, 42])
						for (const trendDamp of [0, 0.5, 1])
							for (const cellP of [24, 96])
								for (const domP of [10, 30, 90, 1e9])
									grid.push({ burstHl, tau, k, profHl, trendDamp, cellP, gain, domP })

	let best: { p: Params; score: number } | null = null
	const t0 = Date.now()
	for (const p of grid) {
		const r = runModel(series, p, splitMs)
		const score = devTotal(r.train, seasonalRef.train)
		if (!best || score < best.score) best = { p, score }
	}
	console.log(
		`grid: ${grid.length} combos in ${((Date.now() - t0) / 1000).toFixed(0)}s; ` +
			`best train score ${best!.score.toFixed(4)} @ ${JSON.stringify(best!.p)}`,
	)

	// ---- holdout comparison
	const chosen = runModel(series, best!.p, splitMs)
	const noburst = runModel(series, best!.p, splitMs, 'noburst')
	const seasonal = runModel(series, best!.p, splitMs, 'seasonal')
	const nodom = runModel(series, { ...best!.p, domP: 1e9 }, splitMs)
	const { naive, flat } = runNaive(series, splitMs)

	console.log('\n=== HOLDOUT (origins 2026-06-20 → now) — MAE and bias (pred/actual) ===')
	fmtScores('flat 28d rate', flat.hold)
	fmtScores('naive last-week', naive.hold)
	fmtScores('seasonal (dow×hour)', seasonal.hold)
	fmtScores('seasonal+trend', noburst.hold)
	fmtScores('full minus payday', nodom.hold)
	fmtScores('full (burst) TUNED', chosen.hold)

	console.log('\n=== TRAIN (origins Apr 17 → Jun 20) ===')
	fmtScores('flat 28d rate', flat.train)
	fmtScores('naive last-week', naive.train)
	fmtScores('seasonal (dow×hour)', seasonal.train)
	fmtScores('seasonal+trend', noburst.train)
	fmtScores('full (burst) TUNED', chosen.train)

	console.log('\nnormalized deviance vs seasonal-at-same-params (lower = better):')
	for (const [label, r] of [
		['seasonal+trend', noburst],
		['full tuned', chosen],
	] as const) {
		console.log(
			`  ${label}: train ${devTotal(r.train, seasonal.train).toFixed(4)}, ` +
				`holdout ${devTotal(r.hold, seasonal.hold).toFixed(4)}`,
		)
	}

	// per-horizon deviance detail for the winner vs seasonal, holdout
	console.log('\nholdout per-horizon mean deviance (seasonal → +trend → full):')
	for (const h of HORIZONS) {
		const a = seasonal.hold.get(h)!
		const b = noburst.hold.get(h)!
		const c = chosen.hold.get(h)!
		if (!a.n) continue
		console.log(
			`  ${h.padEnd(6)} ${(a.dev / a.n).toFixed(3)} → ${(b.dev / b.n).toFixed(3)} → ${(c.dev / c.n).toFixed(3)}   (n=${a.n})`,
		)
	}

	residualDiagnostics(series, best!.p)
	process.exit(0)
}
void main()
