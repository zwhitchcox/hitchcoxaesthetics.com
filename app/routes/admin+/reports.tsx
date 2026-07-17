/**
 * Report hub — every SHA report in one page: a sidebar plus a tiling viewer
 * (any number of columns, each stacking panes, draggable dividers; the layout
 * lives in the URL hash so an arrangement can be bookmarked). Ported from the
 * hep-reports hub (reports2.hepisontheway.com).
 *
 * Metabase dashboards render via signed static embeds (METABASE_EMBED_SECRET,
 * HS256 JWT) so nothing is public; site pages (geo-rank) iframe same-origin.
 * Admin-only, same gate as the rest of /admin.
 */
import crypto from 'node:crypto'
import { type LoaderFunctionArgs } from '@remix-run/node'
import { requireUserWithRole } from '#app/utils/permissions.server'

const MB_URL = 'https://reports.hitchcoxaesthetics.com'
const EMBED_TTL_S = 7 * 24 * 3600

interface HubEntry {
	title: string
	desc: string
	/** Metabase dashboard id (signed embed) — mutually exclusive with path. */
	dashboard?: number
	/** Same-origin site path. */
	path?: string
}

const SECTIONS: Array<{ heading: string; entries: HubEntry[] }> = [
	{
		heading: 'Money',
		entries: [
			{ title: 'Revenue', desc: 'Actuals, this week, projections + P&L profitability, revenue by type/source/day with drill-down', path: '/admin/reports/revenue' },
			{ title: 'Bookings funnel', desc: 'Bookings made by day × source, expected value, ads cost per booking', path: '/admin/reports/bookings' },
			{ title: 'Household profit', desc: 'Biz revenue + take-home − expenses − taxes, monthly', path: '/admin/reports/household-profit' },
			{ title: 'Household budget', desc: 'Personal spending by category, recurring, trends', path: '/admin/reports/household-budget' },
		],
	},
	{
		heading: 'Maps & reach',
		entries: [
			{ title: 'Maps & reach', desc: 'Rank map + competitor leaderboard, household reach, reach → $, GMB clients', path: '/geo-rank' },
			{ title: 'Reach over time', desc: 'People reached + expected revenue per keyword, week by week', path: '/admin/reports/reach' },
			{ title: 'Reach simulator (Metabase)', desc: 'What-if: listings, reviews, simulated rank/reach', dashboard: 4 },
		],
	},
	{
		heading: 'Operations',
		entries: [
			{ title: 'Reviews & scans', desc: 'Review counts + trends per listing, QR scan funnel by brand', path: '/admin/reports/reviews' },
		],
	},
]

function b64url(buf: Buffer) {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Metabase static-embed URL: HS256 JWT over {resource:{dashboard}, params, exp}. */
function embedUrl(dashboardId: number, secret: string) {
	const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
	const payload = b64url(
		Buffer.from(
			JSON.stringify({
				resource: { dashboard: dashboardId },
				params: {},
				exp: Math.floor(Date.now() / 1000) + EMBED_TTL_S,
			}),
		),
	)
	const sig = b64url(crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest())
	return `${MB_URL}/embed/dashboard/${header}.${payload}.${sig}#bordered=false&titled=false`
}

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, 'admin')
	const secret = process.env.METABASE_EMBED_SECRET?.trim()

	const reports: Record<string, { href: string; title: string }> = {}
	const visible = SECTIONS.map(sec => ({
		heading: sec.heading,
		entries: sec.entries.filter(e => e.path || secret),
	}))
	for (const sec of visible) {
		for (const e of sec.entries) {
			const key = (e.path ?? `mb-${e.dashboard}`).replace(/^\//, '')
			reports[key] = {
				href: e.path ?? embedUrl(e.dashboard!, secret!),
				title: e.title,
			}
		}
	}

	const nav = visible
		.map(
			s => `
		<div class="section">${esc(s.heading)}</div>
		${s.entries
			.map(e => {
				const key = (e.path ?? `mb-${e.dashboard}`).replace(/^\//, '')
				return `<a class="item" href="${esc(reports[key]!.href)}" data-key="${esc(key)}">
					 <span class="t">${esc(e.title)}</span><span class="d">${esc(e.desc)}</span></a>`
			})
			.join('\n')}`,
		)
		.join('\n')

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SHA report hub</title>
<style>
	* { box-sizing: border-box; margin: 0; }
	[hidden] { display: none !important; }
	body { font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
				 display: flex; height: 100vh; background: #0f172a; color: #e2e8f0; overflow: hidden; }
	nav { width: 280px; min-width: 280px; overflow-y: auto; padding: 14px 10px 24px;
				border-right: 1px solid #1e293b; }
	h1 { font-size: 15px; padding: 4px 8px 2px; color: #f8fafc; display: flex; align-items: center; }
	#navhide { margin-left: auto; background: none; border: 0; color: #64748b; cursor: pointer;
						 font-size: 14px; padding: 2px 6px; border-radius: 6px; }
	#navhide:hover { background: #1e293b; color: #e2e8f0; }
	body.navless nav { display: none; }
	#navshow { position: fixed; left: 0; top: 10px; z-index: 70; display: none; background: #1e293b;
						 color: #94a3b8; border: 1px solid #334155; border-left: 0; border-radius: 0 8px 8px 0;
						 cursor: pointer; font-size: 14px; padding: 5px 9px 5px 7px; }
	#navshow:hover { color: #f1f5f9; background: #334155; }
	body.navless #navshow { display: block; }
	.navhint { font-size: 11px; color: #475569; padding: 0 8px 8px; }
	.section { font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
						 color: #64748b; padding: 14px 8px 4px; }
	.item { display: block; padding: 7px 8px; border-radius: 8px; text-decoration: none; color: inherit; }
	.item:hover { background: #1e293b; }
	.item .t { display: block; font-weight: 600; color: #f1f5f9; }
	.item .d { display: block; font-size: 12px; color: #94a3b8; }
	main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
	#wm { flex: 1; display: flex; min-height: 0; }
	.col { display: flex; flex-direction: column; min-width: 120px; }
	.pane { display: flex; flex-direction: column; min-height: 90px; overflow: hidden; }
	.pane .bar { display: flex; align-items: center; gap: 8px; padding: 5px 10px;
							 border-bottom: 1px solid #1e293b; background: #0f172a; }
	.pane.focus .bar { box-shadow: inset 0 2px 0 #1d4ed8; }
	.bar .crumb { font-weight: 600; color: #f8fafc; font-size: 12.5px; white-space: nowrap;
								overflow: hidden; text-overflow: ellipsis; }
	.bar a, .bar button { color: #60a5fa; font-size: 11.5px; text-decoration: none; background: none;
												border: 0; cursor: pointer; padding: 0 2px; font-family: inherit; white-space: nowrap; }
	.bar .sp { margin-left: auto; }
	iframe { flex: 1; border: 0; background: #fff; width: 100%; }
	.empty { flex: 1; display: grid; place-items: center; color: #64748b; font-size: 13px;
					 text-align: center; padding: 10px; }
	.gutter-v { width: 5px; cursor: col-resize; background: #1e293b; flex: none; }
	.gutter-v:hover, .gutter-h:hover { background: #1d4ed8; }
	.gutter-h { height: 5px; cursor: row-resize; background: #1e293b; flex: none; }
	body.dragging { user-select: none; }
	body.dragging iframe { pointer-events: none; }
	.pane .bar { cursor: grab; }
	body.dragging .pane .bar { cursor: grabbing; }
	#ghost { position: fixed; z-index: 60; pointer-events: none; background: #1d4ed8; color: #fff;
					 font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 7px;
					 box-shadow: 0 4px 14px rgba(0,0,0,.45); }
	#drophint { position: fixed; z-index: 55; pointer-events: none; background: rgba(29,78,216,.28);
							border: 2px solid #1d4ed8; border-radius: 6px; }
	#insline { position: fixed; z-index: 56; pointer-events: none; height: 3px;
						 background: #1d4ed8; border-radius: 2px; }
</style>
</head>
<body>
<nav>
	<h1>SHA report hub
		<button id="navhide" title="Hide the sidebar (⌘B / Ctrl+B)">⟨⟨</button></h1>
	<div class="navhint">click = open in focused pane &middot; drag a report from this list (or a pane's title bar) into the view: screen edges/dividers = new column, pane edges = split, center = swap/replace, bottom of a column = stack &middot; shift-click = new column &middot; drag dividers to resize &middot; layout saves to the URL</div>
	${nav}
</nav>
<button id="navshow" title="Show the sidebar (⌘B / Ctrl+B)">⟩⟩</button>
<main><div id="wm"></div></main>
<script>
var R = ${JSON.stringify(reports)};
var L = { cols: [{ w: 100, rows: [{ key: null, h: 100 }] }] };
var focus = [0, 0];

function parseHash() {
	var m = location.hash.match(/l=([^&]+)/);
	if (!m) return false;
	try {
		var cols = decodeURIComponent(m[1]).split(",").map(function (cs) {
			var wp = cs.split(":");
			var rows = wp[0].split("+").map(function (rs) {
				var kh = rs.split("@");
				return { key: kh[0] === "_" || !R[kh[0]] ? null : kh[0], h: kh[1] ? +kh[1] : 0 };
			});
			var even = 100 / rows.length;
			rows.forEach(function (r) { if (!r.h) r.h = even; });
			return { w: wp[1] ? +wp[1] : 0, rows: rows };
		});
		var evenW = 100 / cols.length;
		cols.forEach(function (c) { if (!c.w) c.w = evenW; });
		if (cols.length) { L.cols = cols; return true; }
	} catch (e) { /* bad hash — ignore */ }
	return false;
}
function saveHash() {
	var s = L.cols.map(function (c) {
		return c.rows.map(function (r) {
			return (r.key || "_") + "@" + Math.round(r.h);
		}).join("+") + ":" + Math.round(c.w);
	}).join(",");
	history.replaceState(null, "", location.pathname + location.search + "#l=" + encodeURIComponent(s));
}

var wm = document.getElementById("wm");
function render() {
	wm.innerHTML = "";
	L.cols.forEach(function (col, ci) {
		if (ci > 0) wm.appendChild(gutter(false, ci));
		var cel = document.createElement("div");
		cel.className = "col";
		cel.style.flex = "0 0 " + col.w + "%";
		col.rows.forEach(function (row, ri) {
			if (ri > 0) cel.appendChild(gutter(true, ci, ri));
			cel.appendChild(pane(row, ci, ri));
		});
		wm.appendChild(cel);
	});
	markFocus();
}
function pane(row, ci, ri) {
	var p = document.createElement("div");
	p.className = "pane";
	p.style.flex = "0 0 calc(" + row.h + "% - 3px)";
	p.dataset.c = ci; p.dataset.r = ri;
	var rep = row.key ? R[row.key] : null;
	var bar = document.createElement("div");
	bar.className = "bar";
	bar.innerHTML = '<span class="crumb">' + (rep ? rep.title : "Pick a report") + "</span>" +
		'<a class="openx" href="' + (rep ? rep.href : "#") + '" target="_blank" rel="noopener"' + (rep ? "" : " hidden") + '>↗</a>' +
		'<span class="sp"></span>' +
		'<button data-act="splitrow" title="Split this pane into two rows">⊟ split</button>' +
		'<button data-act="newcol" title="Add a column">⊞ column</button>' +
		'<button data-act="close" title="Close this pane">✕</button>';
	p.appendChild(bar);
	if (rep) {
		var f = document.createElement("iframe");
		f.src = rep.href;
		p.appendChild(f);
	} else {
		var e = document.createElement("div");
		e.className = "empty";
		e.textContent = "← pick a report for this pane";
		p.appendChild(e);
	}
	p.addEventListener("mousedown", function () { focus = [ci, ri]; markFocus(); });
	bar.addEventListener("mousedown", function (ev) {
		if (ev.button !== 0) return;
		var t = ev.target;
		if (t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
		if (!L.cols[ci].rows[ri].key) return;
		startDrag(ev, L.cols[ci].rows[ri].key, [ci, ri]);
	});
	bar.addEventListener("click", function (ev) {
		var act = ev.target && ev.target.dataset ? ev.target.dataset.act : null;
		if (!act) return;
		focus = [ci, ri];
		if (act === "splitrow") {
			var rows = L.cols[ci].rows;
			rows.splice(ri + 1, 0, { key: null, h: rows[ri].h / 2 });
			rows[ri].h = rows[ri].h / 2;
			focus = [ci, ri + 1];
		} else if (act === "newcol") {
			var w = L.cols[ci].w / 2;
			L.cols[ci].w = w;
			L.cols.splice(ci + 1, 0, { w: w, rows: [{ key: null, h: 100 }] });
			focus = [ci + 1, 0];
		} else if (act === "close") {
			var c = L.cols[ci];
			if (c.rows.length > 1) {
				var gone = c.rows.splice(ri, 1)[0];
				c.rows[Math.max(0, ri - 1)].h += gone.h;
			} else if (L.cols.length > 1) {
				var gcol = L.cols.splice(ci, 1)[0];
				L.cols[Math.max(0, ci - 1)].w += gcol.w;
			} else {
				c.rows[0].key = null;
			}
			focus = [0, 0];
		}
		saveHash(); render();
	});
	return p;
}
function gutter(horiz, ci, ri) {
	var g = document.createElement("div");
	g.className = horiz ? "gutter-h" : "gutter-v";
	g.dataset.ci = ci;
	if (horiz) g.dataset.ri = ri;
	g.addEventListener("mousedown", function (ev) {
		ev.preventDefault();
		document.body.classList.add("dragging");
		var startX = ev.clientX, startY = ev.clientY;
		var total = horiz ? wm.querySelector(".col").parentElement.clientHeight : wm.clientWidth;
		var a, b;
		if (horiz) { a = L.cols[ci].rows[ri - 1]; b = L.cols[ci].rows[ri]; total = g.parentElement.clientHeight; }
		else { a = L.cols[ci - 1]; b = L.cols[ci]; }
		var a0 = horiz ? a.h : a.w, b0 = horiz ? b.h : b.w;
		function move(e) {
			var deltaPx = horiz ? e.clientY - startY : e.clientX - startX;
			var deltaPct = (deltaPx / total) * 100;
			var na = Math.max(8, Math.min(a0 + b0 - 8, a0 + deltaPct));
			var nb = a0 + b0 - na;
			if (horiz) { a.h = na; b.h = nb; } else { a.w = na; b.w = nb; }
			applySizes();
		}
		function up() {
			document.body.classList.remove("dragging");
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", up);
			saveHash();
		}
		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
	});
	return g;
}
function applySizes() {
	var colEls = wm.querySelectorAll(":scope > .col");
	colEls.forEach(function (cel, ci) {
		cel.style.flex = "0 0 " + L.cols[ci].w + "%";
		var panes = cel.querySelectorAll(":scope > .pane");
		panes.forEach(function (pel, ri) {
			pel.style.flex = "0 0 calc(" + L.cols[ci].rows[ri].h + "% - 3px)";
		});
	});
}
function markFocus() {
	wm.querySelectorAll(".pane").forEach(function (p) {
		p.classList.toggle("focus", +p.dataset.c === focus[0] && +p.dataset.r === focus[1]);
	});
}
function paneUnder(x, y) {
	var els = document.elementsFromPoint(x, y);
	for (var i = 0; i < els.length; i++) {
		if (els[i].classList && els[i].classList.contains("pane")) return els[i];
		var p = els[i].closest ? els[i].closest(".pane") : null;
		if (p) return p;
	}
	return null;
}
function hintBox(pel, zone) {
	var b = pel.getBoundingClientRect();
	var r = { left: b.left, top: b.top, width: b.width, height: b.height };
	if (zone === "left") r.width = b.width / 2;
	else if (zone === "right") { r.left = b.left + b.width / 2; r.width = b.width / 2; }
	else if (zone === "top") r.height = b.height / 2;
	else if (zone === "bottom") { r.top = b.top + b.height / 2; r.height = b.height / 2; }
	return r;
}
function dropTarget(x, y) {
	var W = wm.getBoundingClientRect();
	if (x < W.left || x > W.right || y < W.top || y > W.bottom) return null;
	var EDGE = 56;
	var colW = Math.max(W.width * 0.2, 180);
	if (x < W.left + EDGE)
		return { kind: "newcol", at: 0,
						 rect: { left: W.left, top: W.top, width: colW, height: W.height } };
	if (x > W.right - EDGE)
		return { kind: "newcol", at: L.cols.length,
						 rect: { left: W.right - colW, top: W.top, width: colW, height: W.height } };
	var els = document.elementsFromPoint(x, y);
	for (var i = 0; i < els.length; i++) {
		var el = els[i];
		if (el.classList && el.classList.contains("gutter-v"))
			return { kind: "newcol", at: +el.dataset.ci,
							 rect: { left: x - 60, top: W.top, width: 120, height: W.height } };
	}
	var pel = paneUnder(x, y);
	if (!pel) return null;
	var ci = +pel.dataset.c, ri = +pel.dataset.r;
	var cb = pel.parentElement.getBoundingClientRect();
	if (y > cb.bottom - EDGE) {
		var bandH = Math.max(cb.height * 0.18, 110);
		return { kind: "rowend", ci: ci,
						 rect: { left: cb.left, top: cb.bottom - bandH, width: cb.width, height: bandH } };
	}
	var b = pel.getBoundingClientRect();
	var ex = Math.max(b.width * 0.28, Math.min(140, b.width / 2.5));
	var ey = Math.max(b.height * 0.3, Math.min(120, b.height / 2.5));
	var zone = x < b.left + ex ? "left"
		: x > b.right - ex ? "right"
		: y < b.top + ey ? "top"
		: y > b.bottom - ey ? "bottom"
		: "center";
	return { kind: zone, ci: ci, ri: ri, rect: hintBox(pel, zone) };
}
function performDrop(t, key, src) {
	var sci = src ? src[0] : -1, sri = src ? src[1] : -1;
	if (t.kind === "center") {
		if (src && t.ci === sci && t.ri === sri) return;
		var tgt = L.cols[t.ci].rows[t.ri];
		if (src) {
			L.cols[sci].rows[sri].key = tgt.key;
			tgt.key = key;
			saveHash(); loadPane(sci, sri); loadPane(t.ci, t.ri);
		} else {
			tgt.key = key;
			saveHash(); loadPane(t.ci, t.ri);
		}
		focus = [t.ci, t.ri]; markFocus();
		return;
	}
	var ci = t.ci, ri = t.ri, at = t.at;
	if (src) {
		if (t.kind !== "newcol" && t.kind !== "rowend" && ci === sci && ri === sri) return;
		var colRemoved = removeRow(sci, sri);
		if (colRemoved) {
			if (t.kind === "newcol" && sci < at) at--;
			else if (t.kind !== "newcol" && sci < ci) ci--;
		} else if (t.kind !== "newcol" && sci === ci && sri < ri) ri--;
	}
	if (t.kind === "newcol") {
		var w = 100 / (L.cols.length + 1);
		L.cols.forEach(function (c) { c.w *= (100 - w) / 100; });
		L.cols.splice(at, 0, { w: w, rows: [{ key: key, h: 100 }] });
		focus = [at, 0];
	} else if (t.kind === "rowend") {
		var rows = L.cols[ci].rows;
		var h = 100 / (rows.length + 1);
		rows.forEach(function (r) { r.h *= (100 - h) / 100; });
		rows.push({ key: key, h: h });
		focus = [ci, rows.length - 1];
	} else if (t.kind === "left" || t.kind === "right") {
		var w2 = L.cols[ci].w / 2;
		L.cols[ci].w = w2;
		var atC = t.kind === "left" ? ci : ci + 1;
		L.cols.splice(atC, 0, { w: w2, rows: [{ key: key, h: 100 }] });
		focus = [atC, 0];
	} else {
		var rows2 = L.cols[ci].rows;
		rows2[ri].h /= 2;
		var atR = t.kind === "top" ? ri : ri + 1;
		rows2.splice(atR, 0, { key: key, h: rows2[ri].h });
		focus = [ci, atR];
	}
	saveHash(); render();
}
function removeRow(ci, ri) {
	var c = L.cols[ci];
	if (c.rows.length > 1) {
		var gone = c.rows.splice(ri, 1)[0];
		c.rows[Math.max(0, ri - 1)].h += gone.h;
		return false;
	}
	if (L.cols.length > 1) {
		var gcol = L.cols.splice(ci, 1)[0];
		L.cols[Math.max(0, ci - 1)].w += gcol.w;
		return true;
	}
	c.rows[0].key = null;
	return false;
}
var navEl = document.querySelector("nav");
var NAV_KEY = "sha-hub-nav-order-v1";
function navGap(y) {
	var items = navEl.querySelectorAll("a.item");
	for (var i = 0; i < items.length; i++) {
		var b = items[i].getBoundingClientRect();
		if (y < b.top + b.height / 2) return items[i];
	}
	return null;
}
function saveNavOrder() {
	var out = [], sec = null;
	navEl.querySelectorAll(".section, a.item[data-key]").forEach(function (el) {
		if (el.classList.contains("section")) { sec = { h: el.textContent, keys: [] }; out.push(sec); }
		else if (sec) sec.keys.push(el.dataset.key);
	});
	try { localStorage.setItem(NAV_KEY, JSON.stringify(out)); } catch (e) { }
}
function applyNavOrder() {
	var cfg;
	try { cfg = JSON.parse(localStorage.getItem(NAV_KEY) || "null"); } catch (e) { return; }
	if (!cfg || !cfg.length) return;
	var byKey = {};
	navEl.querySelectorAll("a.item[data-key]").forEach(function (a) { byKey[a.dataset.key] = a; });
	cfg.forEach(function (sec) {
		var heads = Array.prototype.filter.call(
			navEl.querySelectorAll(".section"),
			function (h) { return h.textContent === sec.h; });
		if (!heads.length) return;
		var after = heads[0];
		sec.keys.forEach(function (k) {
			var a = byKey[k];
			if (!a) return;
			after.after(a);
			after = a;
		});
	});
}
var dragJustEnded = false;
function startDrag(ev, key, src, navItem) {
	ev.preventDefault();
	var startX = ev.clientX, startY = ev.clientY;
	var live = false, ghost = null, hint = null, ins = null;
	function ensureUi() {
		document.body.classList.add("dragging");
		ghost = document.createElement("div");
		ghost.id = "ghost";
		ghost.textContent = R[key].title;
		document.body.appendChild(ghost);
		hint = document.createElement("div");
		hint.id = "drophint";
		hint.hidden = true;
		document.body.appendChild(hint);
		ins = document.createElement("div");
		ins.id = "insline";
		ins.hidden = true;
		document.body.appendChild(ins);
	}
	function overNav(e) {
		var nb = navEl.getBoundingClientRect();
		return navItem && e.clientX < nb.right;
	}
	function move(e) {
		if (!live) {
			if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 6) return;
			live = true;
			ensureUi();
		}
		ghost.style.left = e.clientX + 12 + "px";
		ghost.style.top = e.clientY + 10 + "px";
		if (overNav(e)) {
			hint.hidden = true;
			var before = navGap(e.clientY);
			var nb = navEl.getBoundingClientRect();
			var y = before ? before.getBoundingClientRect().top
										 : navEl.querySelector("a.item:last-of-type").getBoundingClientRect().bottom;
			ins.style.left = nb.left + 8 + "px";
			ins.style.width = nb.width - 16 + "px";
			ins.style.top = y - 1 + "px";
			ins.hidden = false;
			return;
		}
		ins.hidden = true;
		var t = dropTarget(e.clientX, e.clientY);
		var samePane = t && src && t.kind === "center" && t.ci === src[0] && t.ri === src[1];
		if (!t || samePane) { hint.hidden = true; return; }
		hint.style.left = t.rect.left + "px";
		hint.style.top = t.rect.top + "px";
		hint.style.width = t.rect.width + "px";
		hint.style.height = t.rect.height + "px";
		hint.hidden = false;
	}
	function up(e) {
		window.removeEventListener("mousemove", move);
		window.removeEventListener("mouseup", up);
		if (!live) return;
		document.body.classList.remove("dragging");
		ghost.remove(); hint.remove(); ins.remove();
		dragJustEnded = true;
		setTimeout(function () { dragJustEnded = false; }, 0);
		if (overNav(e)) {
			var before = navGap(e.clientY);
			if (before === navItem) return;
			if (before) before.before(navItem); else navEl.appendChild(navItem);
			saveNavOrder();
			return;
		}
		var t = dropTarget(e.clientX, e.clientY);
		if (t) performDrop(t, key, src);
	}
	window.addEventListener("mousemove", move);
	window.addEventListener("mouseup", up);
}
window.addEventListener("blur", function () {
	var el = document.activeElement;
	if (el && el.tagName === "IFRAME") {
		var p = el.closest(".pane");
		if (p) { focus = [+p.dataset.c, +p.dataset.r]; markFocus(); }
	}
});
function loadPane(ci, ri) {
	var pel = wm.querySelector('.pane[data-c="' + ci + '"][data-r="' + ri + '"]');
	if (!pel) { render(); return; }
	var row = L.cols[ci].rows[ri];
	var rep = row.key ? R[row.key] : null;
	var o = pel.querySelector(".openx");
	var f = pel.querySelector("iframe");
	var e = pel.querySelector(".empty");
	if (!rep) {
		pel.querySelector(".crumb").textContent = "Pick a report";
		if (o) o.hidden = true;
		if (f) f.remove();
		if (!e) {
			e = document.createElement("div");
			e.className = "empty";
			e.textContent = "← pick a report for this pane";
			pel.appendChild(e);
		}
		return;
	}
	pel.querySelector(".crumb").textContent = rep.title;
	if (o) { o.href = rep.href; o.hidden = false; }
	else {
		o = document.createElement("a");
		o.className = "openx"; o.target = "_blank"; o.rel = "noopener"; o.textContent = "↗"; o.href = rep.href;
		pel.querySelector(".bar .crumb").after(o);
	}
	if (e) e.remove();
	if (!f) { f = document.createElement("iframe"); pel.appendChild(f); }
	if (f.getAttribute("src") !== rep.href) f.src = rep.href;
	f.hidden = false;
}
document.querySelectorAll("a.item[data-key]").forEach(function (a) {
	a.draggable = false;
	a.addEventListener("mousedown", function (ev) {
		if (ev.button !== 0 || ev.shiftKey) return;
		startDrag(ev, a.dataset.key, null, a);
	});
	a.addEventListener("click", function (ev) {
		ev.preventDefault();
		if (dragJustEnded) return;
		var key = a.dataset.key;
		if (ev.shiftKey) {
			var w = 100 / (L.cols.length + 1);
			L.cols.forEach(function (c) { c.w = c.w * (100 - w) / 100; });
			L.cols.push({ w: w, rows: [{ key: key, h: 100 }] });
			focus = [L.cols.length - 1, 0];
			saveHash(); render();
		} else {
			L.cols[focus[0]].rows[focus[1]].key = key;
			saveHash(); loadPane(focus[0], focus[1]); markFocus();
		}
	});
});
function setNavless(on) {
	document.body.classList.toggle("navless", on);
	try { localStorage.setItem("sha-hub-nav-hidden", on ? "1" : ""); } catch (e) { }
}
document.getElementById("navhide").addEventListener("click", function () { setNavless(true); });
document.getElementById("navshow").addEventListener("click", function () { setNavless(false); });
window.addEventListener("keydown", function (e) {
	if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
		e.preventDefault();
		setNavless(!document.body.classList.contains("navless"));
	}
});
try { if (localStorage.getItem("sha-hub-nav-hidden") === "1") setNavless(true); } catch (e) { }

applyNavOrder();
if (!parseHash()) {
	L.cols = [{ w: 50, rows: [{ key: "admin/reports/revenue", h: 100 }] },
	          { w: 50, rows: [{ key: "geo-rank", h: 50 }, { key: "admin/reports/bookings", h: 50 }] }];
}
render();
</script>
</body>
</html>`

	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
