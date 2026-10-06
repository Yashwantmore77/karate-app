import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { readXlsx } from './excel'

// A coach's real spreadsheet: typed dates, numbers, a formula, a blank row.
describe('reading an Excel bulk upload', () => {
  it('turns the first sheet into rows of text', async () => {
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('Players')
    sheet.addRow(['Player Name', 'DOB', 'Gender', 'Event', 'Weight (kg)'])
    sheet.addRow(['Rahul Sharma', new Date(Date.UTC(2014, 5, 15)), 'M', 'Kumite', 34.5])
    sheet.addRow([])
    sheet.addRow(['Amit Verma', '15/06/2013', 'Boy', 'Kata', { formula: '30+2', result: 32 }])
    const buffer = await book.xlsx.writeBuffer()
    const file = { arrayBuffer: async () => buffer }

    expect(await readXlsx(file)).toEqual([
      ['Player Name', 'DOB', 'Gender', 'Event', 'Weight (kg)'],
      ['Rahul Sharma', '2014-06-15', 'M', 'Kumite', '34.5'],
      ['Amit Verma', '15/06/2013', 'Boy', 'Kata', '32'],
    ])
  })
})
