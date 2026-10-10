import fs from 'node:fs'
import { chromium } from 'playwright-core'

// The Chromium to drive: CHROMIUM_PATH if set, else the one installed in this
// project's cloud environment, else Playwright's own (npx playwright-core install chromium).
export const launchChromium = (options = {}) => chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p)),
  ...options,
})
