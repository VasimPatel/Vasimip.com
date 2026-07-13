import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } })
const p = await b.newPage()
const logs = []
p.on('console', m => { const t = m.text(); if (t.includes('[engine]')) logs.push(t.slice(0, 130)) })
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 800))
await p.evaluate(() => window.__notebookGoTo(4))
await new Promise(r => setTimeout(r, 7000))
console.log(logs.join('\n'))
await b.close()
