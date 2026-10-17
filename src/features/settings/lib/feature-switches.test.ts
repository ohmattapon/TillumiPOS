import type { HomeView } from '@pos/api/shop-settings'
import { expect, test } from 'bun:test'
import { withTablesSwitch } from './feature-switches'

const form = (tablesEnabled: boolean, homeView: HomeView) => ({ tablesEnabled, homeView, shopName: 'ร้าน' })

test('turning tables off moves home to the till', () => {
  expect(withTablesSwitch(form(true, 'tables'), false)).toEqual(form(false, 'till'))
})

test('turning tables on keeps the chosen home', () => {
  expect(withTablesSwitch(form(false, 'till'), true)).toEqual(form(true, 'till'))
})

test('the rest of the form is kept', () => {
  expect(withTablesSwitch(form(true, 'till'), false).shopName).toBe('ร้าน')
})
