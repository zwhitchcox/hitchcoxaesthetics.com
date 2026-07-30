import { config as loadDotenv } from 'dotenv'
loadDotenv({ override: true })
const { prisma } = await import('../app/utils/db.server.ts')
const items = await prisma.blvdRevenueItem.findMany({
  where: { itemName: { contains: 'eight' }, grossAmountUsd: { gt: 0 } },
  select: { boulevardClientId: true, occurredAt: true, grossAmountUsd: true },
  orderBy: { occurredAt: 'asc' },
})
const byClient = new Map<string, {ms:number; usd:number}[]>()
for (const i of items) {
  if (!i.boulevardClientId) continue
  const day = i.occurredAt.toISOString().slice(0,10)
  const arr = byClient.get(i.boulevardClientId) ?? []
  const last = arr.at(-1)
  if (last && new Date(last.ms).toISOString().slice(0,10) === day) last.usd += i.grossAmountUsd
  else arr.push({ms:i.occurredAt.getTime(), usd:i.grossAmountUsd})
  byClient.set(i.boulevardClientId, arr)
}
const D = 86400000
const cohort = (m:number)=> m<=9?'weekly':m<=17?'biweekly':m<=24?'3-week':m<=35?'monthly':'longer'
const stats = new Map<string,{n:number; amt:number; perMonth:number}>()
const errs: number[] = []
for (const [, pays] of byClient) {
  if (pays.length < 3) continue
  const gaps = pays.slice(1).map((p,i)=>Math.round((p.ms-pays[i]!.ms)/D)).filter(g=>g>0)
  if (gaps.length < 2) continue
  const sorted=[...gaps].sort((a,b)=>a-b); const med = sorted[Math.floor((sorted.length-1)/2)]!
  const c = cohort(med)
  const avgAmt = pays.reduce((s,p)=>s+p.usd,0)/pays.length
  const e = stats.get(c) ?? {n:0,amt:0,perMonth:0}
  e.n++; e.amt += avgAmt; e.perMonth += avgAmt * (30/med)
  stats.set(c,e)
  // walk-forward: predict each payment date from median of prior gaps
  for (let k=2;k<pays.length;k++){
    const prior = pays.slice(0,k).slice(1).map((p,i)=>Math.round((p.ms-pays[i]!.ms)/D)).filter(g=>g>0)
    if(!prior.length) continue
    const ps=[...prior].sort((a,b)=>a-b); const pm=ps[Math.floor((ps.length-1)/2)]!
    const predicted = pays[k-1]!.ms + pm*D
    errs.push(Math.round((pays[k]!.ms - predicted)/D))
  }
}
console.log('cohort      clients  avg payment  implied $/month/client')
for (const [c,e] of [...stats].sort((a,b)=>b[1].n-a[1].n))
  console.log(`  ${c.padEnd(10)} ${String(e.n).padStart(5)}   $${String(Math.round(e.amt/e.n)).padStart(5)}      $${Math.round(e.perMonth/e.n)}`)
errs.sort((a,b)=>a-b)
const abs = errs.map(Math.abs).sort((a,b)=>a-b)
console.log(`\nnext-payment-date prediction (median-of-prior-gaps), n=${errs.length}`)
console.log(`  median signed error: ${errs[Math.floor(errs.length/2)]}d   median ABS error: ${abs[Math.floor(abs.length/2)]}d`)
console.log(`  within +/-3d: ${Math.round(100*abs.filter(e=>e<=3).length/abs.length)}%   within +/-7d: ${Math.round(100*abs.filter(e=>e<=7).length/abs.length)}%`)
console.log(`  late by >7d: ${Math.round(100*errs.filter(e=>e>7).length/errs.length)}%  early by >7d: ${Math.round(100*errs.filter(e=>e< -7).length/errs.length)}%`)
process.exit(0)
