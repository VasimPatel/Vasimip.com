import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 760 } })
const p = await b.newPage()
await p.goto('http://localhost:5197/dev/charm.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 2200))
const m = await p.evaluate(() => {
  const g = document.querySelector('[data-dash-renderer]')
  const head = g.querySelector('circle[fill="#fffdf6"]')
  const hr = head.getBoundingClientRect()
  const hc = { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2, r: hr.width / 2 }
  const face = g.querySelectorAll('g')[0] // faceGroup is the only <g> inside
  const out = { headR_px: hc.r }
  const els = g.querySelectorAll('ellipse')
  out.pupils = [...els].map((e) => {
    const r = e.getBoundingClientRect()
    return {
      dx: +(((r.x + r.width / 2) - hc.x) / hc.r).toFixed(3),
      dy: +(((r.y + r.height / 2) - hc.y) / hc.r).toFixed(3),
      r: +((r.width / 2) / hc.r).toFixed(3),
    }
  })
  const paths = [...face.querySelectorAll('path')].map((el) => {
    const r = el.getBoundingClientRect()
    return {
      d: el.getAttribute('d').slice(0, 40),
      cx: +(((r.x + r.width / 2) - hc.x) / hc.r).toFixed(3),
      cy: +(((r.y + r.height / 2) - hc.y) / hc.r).toFixed(3),
      w: +((r.width) / hc.r).toFixed(3),
    }
  })
  out.faceParts = paths
  return out
})
console.log(JSON.stringify(m, null, 1))
// Legacy reference (units of head radius, from Idle.tsx, head c(2,-30) r14):
// eyes: dx -0.143 & +0.643, dy +0.071, r 0.143  (pair center +0.25)
// brows: centers dx -0.32 & +0.82, dy -0.34, len 0.64, slope 0.28
// mouth: from (0.07,0.64) q to (0.71,0.5) — low, on the facing side
await b.close()
