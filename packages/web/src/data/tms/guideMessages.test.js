import fs from 'fs'
import path from 'path'
import { ERROR_TEXT } from '.'

// docs/user-guide/README.md section 13 promises every message the app shows,
// with what to do. A message added here without a row there fails this test.
const GUIDE = path.resolve(__dirname, '../../../../../docs/user-guide/README.md')
const plain = (text) => text.replace(/[‘’]/g, "'")

describe('user guide messages', () => {
  it('lists every message the app can show, word for word', () => {
    const guide = plain(fs.readFileSync(GUIDE, 'utf8'))
    const missing = Object.entries(ERROR_TEXT).filter(([, text]) => !guide.includes(plain(text))).map(([code]) => code)
    expect(missing).toEqual([])
  })
})
