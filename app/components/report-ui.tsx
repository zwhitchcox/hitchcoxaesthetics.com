/**
 * Shared UI for the native report pages under /admin/reports/*. One style
 * block, stat tiles, tables, and two SVG chart forms (bars, lines) with a
 * hover layer. Palette follows the dataviz reference instance: categorical
 * slots in fixed order, diverging blue↔red, status colors reserved.
 */
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'

/** Categorical slots, fixed order, never cycled. */
export const SERIES = [
	'var(--series-1)',
	'var(--series-2)',
	'var(--series-3)',
	'var(--series-4)',
	'var(--series-5)',
	'var(--series-6)',
	'var(--series-7)',
	'var(--series-8)',
]

const CSS = `
.report-root {
	--surface-1: #fcfcfb; --page: #f9f9f7;
	--ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
	--grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,.1);
	--row-hover: #f0efec;
	--series-1: #2a78d6; --series-2: #1baf7a; --series-3: #eda100; --series-4: #008300;
	--series-5: #4a3aa7; --series-6: #e34948; --series-7: #e87ba4; --series-8: #eb6834;
	--pos: #2a78d6; --neg: #e34948; --good-text: #006300; --bad-text: #d03b3b;
	font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
	background: var(--page); color: var(--ink);
	min-height: 100vh; padding: 18px 20px 40px;
}
@media (prefers-color-scheme: dark) {
	.report-root {
		--surface-1: #1a1a19; --page: #0d0d0d;
		--ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
		--grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,.1);
		--row-hover: #262624;
		--series-1: #3987e5; --series-2: #199e70; --series-3: #c98500; --series-4: #008300;
		--series-5: #9085e9; --series-6: #e66767; --series-7: #d55181; --series-8: #d95926;
		--pos: #3987e5; --neg: #e66767; --good-text: #0ca30c; --bad-text: #e66767;
	}
}
.report-root * { box-sizing: border-box; }
.report-root h1 { font-size: 17px; margin: 0 0 2px; }
.report-root .sub { color: var(--ink-2); font-size: 12.5px; margin: 0 0 14px; }
.report-root section { background: var(--surface-1); border: 1px solid var(--ring);
	border-radius: 10px; padding: 14px 16px 16px; margin: 0 0 14px; }
.report-root h2 { font-size: 13.5px; margin: 0 0 10px; }
.report-root h2 .mini { font-weight: 400; color: var(--muted); font-size: 11.5px; }
.tiles { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.tile { flex: 1 1 150px; background: var(--surface-1); border: 1px solid var(--ring);
	border-radius: 10px; padding: 10px 14px; }
.tile .label { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.tile .val { font-size: 21px; font-weight: 700; margin-top: 1px; white-space: nowrap; }
.tile .whisper { font-size: 11.5px; color: var(--ink-2); }
.rtable-wrap { overflow-x: auto; }
table.rtable { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 13px; }
.rtable th, .rtable td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--grid); }
.rtable th { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
.rtable td.num, .rtable th.num { text-align: right; white-space: nowrap; }
.rtable tr:last-child td { border-bottom: none; }
.rtable tbody tr:hover { background: var(--row-hover); }
.rtable th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.rtable th.sortable:hover { color: var(--ink); }
.rtable td.good { color: var(--good-text); }
.rtable td.bad { color: var(--bad-text); }
.legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-2); margin: 2px 0 6px; }
.legend .sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.chart-wrap { position: relative; }
.chart-tip { position: absolute; pointer-events: none; background: var(--ink); color: var(--page);
	font-size: 11.5px; padding: 4px 8px; border-radius: 6px; white-space: nowrap; z-index: 5;
	transform: translate(-50%, calc(-100% - 8px)); }
.chart-tip .row { display: flex; gap: 8px; justify-content: space-between; }
.note { font-size: 12px; color: var(--ink-2); margin-top: 8px; }
.controls { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; font-size: 12.5px; }
.controls select, .controls input[type="date"] { font: inherit; padding: 4px 8px; border-radius: 7px; border: 1px solid var(--axis);
	background: var(--surface-1); color: var(--ink); }
.controls button { font: inherit; font-weight: 600; padding: 5px 14px; border-radius: 7px;
	border: 1px solid var(--axis); background: var(--surface-1); color: var(--ink); cursor: pointer; }
.controls button:hover { background: var(--surface-2, #f3f2ef); }
.controls button:disabled { opacity: 0.6; cursor: default; }
`

export function ReportPage({
	title,
	subtitle,
	children,
}: {
	title: string
	subtitle?: string
	children: ReactNode
}) {
	return (
		<div className="report-root">
			<style dangerouslySetInnerHTML={{ __html: CSS }} />
			<h1>{title}</h1>
			{subtitle ? <p className="sub">{subtitle}</p> : null}
			{children}
		</div>
	)
}

export const usd = (n: number | null | undefined, digits = 0) =>
	n == null
		? '-'
		: (n < 0 ? '−' : '') +
			'$' +
			Math.abs(n).toLocaleString('en-US', {
				maximumFractionDigits: digits,
				minimumFractionDigits: 0,
			})

export function StatTile({
	label,
	value,
	whisper,
	tone,
}: {
	label: string
	value: string
	whisper?: string
	tone?: 'good' | 'bad'
}) {
	return (
		<div className="tile">
			<div className="label">{label}</div>
			<div
				className="val"
				style={
					tone
						? { color: tone === 'good' ? 'var(--good-text)' : 'var(--bad-text)' }
						: undefined
				}
			>
				{value}
			</div>
			{whisper ? <div className="whisper">{whisper}</div> : null}
		</div>
	)
}

export function Legend({ items }: { items: Array<{ name: string; color: string }> }) {
	if (items.length < 2) return null
	return (
		<div className="legend">
			{items.map(i => (
				<span key={i.name}>
					<span className="sw" style={{ background: i.color }} />
					{i.name}
				</span>
			))}
		</div>
	)
}

export interface Series {
	name: string
	color: string
	values: Array<number | null>
}

interface Tip {
	x: number
	y: number
	title: string
	rows: Array<{ name: string; color?: string; value: string }>
}

function useTip() {
	const [tip, setTip] = useState<Tip | null>(null)
	const ref = useRef<HTMLDivElement>(null)
	// Keep the tooltip inside the container, points near the right edge were
	// rendering half off-page (clipped by the pane).
	const clampX = (x: number) => {
		const w = ref.current?.clientWidth ?? Number.MAX_SAFE_INTEGER
		return Math.min(Math.max(x, 90), Math.max(90, w - 90))
	}
	return { tip, setTip, ref, clampX }
}

/**
 * Click-to-sort for report tables. Returns sorted rows plus a Th component
 * that renders a sortable header cell; first click sorts descending, second
 * flips. Optional accessors compute the sort value for non-scalar fields.
 */
export function useSortable<T extends Record<string, any>>(
	rows: T[],
	accessors: Record<string, (row: T) => unknown> = {},
) {
	const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
	const sorted = useMemo(() => {
		if (!sort) return rows
		const get = accessors[sort.key] ?? ((r: T) => r[sort.key])
		return [...rows].sort((a, b) => {
			const av = get(a)
			const bv = get(b)
			if (av == null && bv == null) return 0
			if (av == null) return 1
			if (bv == null) return -1
			const cmp =
				typeof av === 'number' && typeof bv === 'number'
					? av - bv
					: String(av).localeCompare(String(bv))
			return cmp * sort.dir
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rows, sort])
	const Th = ({
		k,
		children,
		num,
	}: {
		k: string
		children: ReactNode
		num?: boolean
	}) => (
		<th
			className={`sortable${num ? ' num' : ''}`}
			onClick={() =>
				setSort(s => (s?.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: -1 }))
			}
			title="Click to sort"
		>
			{children}
			{sort?.key === k ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
		</th>
	)
	return { rows: sorted, Th }
}

function niceMax(n: number) {
	if (n <= 0) return 1
	const mag = 10 ** Math.floor(Math.log10(n))
	for (const m of [1, 2, 2.5, 5, 10]) if (n <= m * mag) return m * mag
	return 10 * mag
}

const W = 900
const PAD_L = 56
const PAD_R = 10
const PAD_T = 8

/**
 * Bars over categorical x. Multi-series renders grouped bars (or stacked with
 * `stacked`); a single series may carry per-value colors via `colorBy`
 * (e.g. diverging pos/neg). 4px rounded top on the data end, 2px surface gaps.
 */
export function BarChart({
	labels,
	series,
	stacked = false,
	height = 200,
	colorBy,
	format = usd,
	tickEvery,
	showTotal = true,
	onBarClick,
}: {
	labels: string[]
	series: Series[]
	stacked?: boolean
	height?: number
	colorBy?: (v: number) => string
	format?: (n: number) => string
	tickEvery?: number
	/** Total row in the tooltip only makes sense when the series share a unit. */
	showTotal?: boolean
	/**
	 * Makes buckets clickable. Clicking a bar segment reports its series name;
	 * clicking elsewhere in the bucket (the hover rect) reports ''.
	 */
	onBarClick?: (seriesName: string, labelIndex: number) => void
}) {
	const { tip, setTip, ref, clampX } = useTip()
	const H = height
	const plotH = H - PAD_T - 20
	const all = stacked
		? labels.map((_, i) => series.reduce((s, sr) => s + Math.max(0, sr.values[i] ?? 0), 0))
		: series.flatMap(s => s.values.map(v => v ?? 0))
	const hasNeg = !stacked && series.some(s => s.values.some(v => (v ?? 0) < 0))
	const maxV = niceMax(Math.max(...all.map(v => Math.abs(v)), 1))
	const zeroY = hasNeg ? PAD_T + plotH / 2 : PAD_T + plotH
	const scale = (hasNeg ? plotH / 2 : plotH) / maxV
	const slot = (W - PAD_L - PAD_R) / labels.length
	const groupN = stacked ? 1 : series.length
	const barW = Math.max(2, Math.min(26, (slot - 4) / groupN - 2))
	const every = tickEvery ?? Math.ceil(labels.length / 12)
	const gridVals = hasNeg ? [-maxV, -maxV / 2, 0, maxV / 2, maxV] : [0, maxV / 2, maxV]

	return (
		<div className="chart-wrap" ref={ref}>
			<Legend items={series.map(s => ({ name: s.name, color: s.color }))} />
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: '100%', height: 'auto', display: 'block' }}
				onMouseLeave={() => setTip(null)}
			>
				{gridVals.map(g => {
					const y = zeroY - g * scale
					return (
						<g key={g}>
							<line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke={g === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
							<text x={PAD_L - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
								{format(g)}
							</text>
						</g>
					)
				})}
				{labels.map((lab, i) => {
					const cx = PAD_L + slot * i + slot / 2
					const hover = (evt: React.MouseEvent) => {
						const box = ref.current!.getBoundingClientRect()
						const rows = series.map(s => ({
							name: s.name,
							color: s.color,
							value: s.values[i] == null ? '-' : format(s.values[i]!),
						}))
						if (series.length > 1 && showTotal) {
							rows.push({
								name: 'Total',
								color: '',
								value: format(
									series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
								),
							})
						}
						setTip({
							x: evt.clientX - box.left,
							y: evt.clientY - box.top,
							title: lab,
							rows,
						})
					}
					let stackY = zeroY
					// topmost non-zero segment gets the rounded cap; the rest stay
					// flat so the stack reads as one bar, and zero segments are
					// skipped entirely (no phantom gaps).
					const topSi = stacked
						? series.reduce((acc, s, si) => ((s.values[i] ?? 0) > 0 ? si : acc), -1)
						: -1
					return (
						<g
							key={i}
							onMouseMove={hover}
							onClick={onBarClick ? () => onBarClick('', i) : undefined}
							style={onBarClick ? { cursor: 'pointer' } : undefined}
						>
							<rect x={PAD_L + slot * i} y={PAD_T} width={slot} height={H - PAD_T - 16} fill="transparent" />
							{series.map((s, si) => {
								const v = s.values[i]
								if (v == null || (stacked && v === 0)) return null
								const h = Math.abs(v) * scale
								let x: number, y: number
								if (stacked) {
									x = cx - barW / 2
									y = stackY - h
									stackY -= h + 1
								} else {
									x = cx - (groupN * (barW + 2)) / 2 + si * (barW + 2)
									y = v >= 0 ? zeroY - h : zeroY
								}
								const fill = colorBy && series.length === 1 ? colorBy(v) : s.color
								const r = stacked && si !== topSi ? 0 : Math.min(4, barW / 2, h)
								const up = v >= 0 || stacked
								// rounded corners only on the data end
								const d = up
									? `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`
									: `M${x},${y} L${x + barW},${y} L${x + barW},${y + h - r} Q${x + barW},${y + h} ${x + barW - r},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} Z`
								return (
									<path
										key={si}
										d={d}
										fill={fill}
										onClick={
											onBarClick
												? evt => {
														evt.stopPropagation()
														onBarClick(s.name, i)
													}
												: undefined
										}
									/>
								)
							})}
							{i % every === 0 ? (
								<text x={cx} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--muted)">
									{lab}
								</text>
							) : null}
						</g>
					)
				})}
			</svg>
			{tip ? (
				<div className="chart-tip" style={{ left: clampX(tip.x), top: tip.y }}>
					<div style={{ fontWeight: 600 }}>{tip.title}</div>
					{tip.rows.map(r => (
						<div className="row" key={r.name}>
							<span>
								{r.color ? <span className="sw" style={{ background: r.color, display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 4 }} /> : null}
								{r.name}
							</span>
							<span>{r.value}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	)
}

/** Multi-series line chart over categorical x with crosshair + tooltip. */
export function LineChart({
	labels,
	series,
	height = 200,
	format = usd,
	yMax,
	tickEvery,
}: {
	labels: string[]
	series: Series[]
	height?: number
	format?: (n: number) => string
	yMax?: number
	tickEvery?: number
}) {
	const { tip, setTip, ref, clampX } = useTip()
	const id = useId()
	const H = height
	const plotH = H - PAD_T - 20
	const maxV = yMax ?? niceMax(Math.max(...series.flatMap(s => s.values.map(v => v ?? 0)), 1))
	const x = (i: number) =>
		PAD_L + ((W - PAD_L - PAD_R) * (labels.length === 1 ? 0.5 : i / (labels.length - 1)))
	const y = (v: number) => PAD_T + plotH - (v / maxV) * plotH
	const [hoverI, setHoverI] = useState<number | null>(null)
	const every = tickEvery ?? Math.ceil(labels.length / 10)

	return (
		<div className="chart-wrap" ref={ref}>
			<Legend items={series.map(s => ({ name: s.name, color: s.color }))} />
			<svg
				viewBox={`0 0 ${W} ${H}`}
				style={{ width: '100%', height: 'auto', display: 'block' }}
				onMouseLeave={() => {
					setTip(null)
					setHoverI(null)
				}}
				onMouseMove={evt => {
					const svg = evt.currentTarget
					const box = svg.getBoundingClientRect()
					const px = ((evt.clientX - box.left) / box.width) * W
					const i = Math.max(
						0,
						Math.min(
							labels.length - 1,
							Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (labels.length - 1)),
						),
					)
					setHoverI(i)
					const wrap = ref.current!.getBoundingClientRect()
					setTip({
						x: ((x(i) / W) * box.width + box.left - wrap.left),
						y: evt.clientY - wrap.top,
						title: labels[i]!,
						rows: series
							.filter(s => s.values[i] != null)
							.map(s => ({ name: s.name, color: s.color, value: format(s.values[i]!) })),
					})
				}}
			>
				{[0, maxV / 2, maxV].map(g => (
					<g key={g}>
						<line x1={PAD_L} x2={W - PAD_R} y1={y(g)} y2={y(g)} stroke={g === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
						<text x={PAD_L - 6} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
							{format(g)}
						</text>
					</g>
				))}
				{labels.map((lab, i) =>
					i % every === 0 ? (
						<text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--muted)">
							{lab}
						</text>
					) : null,
				)}
				{hoverI != null ? (
					<line x1={x(hoverI)} x2={x(hoverI)} y1={PAD_T} y2={PAD_T + plotH} stroke="var(--axis)" strokeWidth={1} />
				) : null}
				{series.map(s => {
					const pts = s.values
						.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
						.filter(Boolean)
						.join(' ')
					return (
						<g key={s.name}>
							<polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} clipPath={`url(#clip-${id})`} />
							{hoverI != null && s.values[hoverI] != null ? (
								<circle cx={x(hoverI)} cy={y(s.values[hoverI]!)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />
							) : null}
						</g>
					)
				})}
				<clipPath id={`clip-${id}`}>
					<rect x={PAD_L} y={0} width={W - PAD_L - PAD_R} height={H} />
				</clipPath>
			</svg>
			{tip ? (
				<div className="chart-tip" style={{ left: clampX(tip.x), top: tip.y }}>
					<div style={{ fontWeight: 600 }}>{tip.title}</div>
					{tip.rows.map(r => (
						<div className="row" key={r.name}>
							<span>
								<span style={{ background: r.color, display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 4 }} />
								{r.name}
							</span>
							<span>{r.value}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	)
}
