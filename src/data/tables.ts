import type { Table } from '../types'

const createTable = (id: string, name: string): Table => ({
  id,
  name,
  status: 'empty',
  cart: [],
  discountRate: 0,
  note: ''
})

export const initialTables: Table[] = [
  ...Array.from({ length: 12 }, (_, i) => createTable(`masa-${i + 1}`, `Masa ${i + 1}`)),
  ...Array.from({ length: 4 }, (_, i) => createTable(`bahce-${i + 1}`, `Bahçe ${i + 1}`)),
]
