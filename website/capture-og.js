import { webkit } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const browser = await webkit.launch({ headless: true })
const page = await browser.newPage()

await page.setViewportSize({ width: 1200, height: 630 })

const htmlPath = join(__dirname, 'public', 'og-temp.html')
const htmlContent = readFileSync(htmlPath, 'utf-8')

await page.setContent(htmlContent, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

const outputPath = join(__dirname, 'public', 'og-image.png')
await page.screenshot({
  path: outputPath,
  type: 'png',
})

await browser.close()
console.log(`✓ OG image saved to ${outputPath}`)