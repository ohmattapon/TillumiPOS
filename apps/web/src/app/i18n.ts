import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { authLocales } from '@/features/auth'
import { branchesLocales } from '@/features/branches'
import { categoriesLocales } from '@/features/categories'
import { modifiersLocales } from '@/features/modifiers'
import { posLocales } from '@/features/pos'
import { productsLocales } from '@/features/products'
import { salesLocales } from '@/features/sales'
import { reportsLocales } from '@/features/reports'
import { settingsLocales } from '@/features/settings'
import { setupLocales } from '@/features/setup'
import { tablesLocales } from '@/features/tables'
import { usersLocales } from '@/features/users'
import { shiftsLocales } from '@/features/shifts'
import { common } from '@/locales/common'
import { errors } from '@/locales/errors'
import type { Locale } from '@/lib/money'
import { locales as appLocales } from './locales'

/**
 * Every string a person reads. Each feature owns its namespace (features/<name>/locales.ts);
 * `common` holds what several features share. Thai is the source of truth for the key types.
 */
export const resources = {
  th: {
    common: common.th,
    app: appLocales.th,
    auth: authLocales.th,
    branches: branchesLocales.th,
    categories: categoriesLocales.th,
    modifiers: modifiersLocales.th,
    tables: tablesLocales.th,
    users: usersLocales.th,
    pos: posLocales.th,
    products: productsLocales.th,
    sales: salesLocales.th,
    reports: reportsLocales.th,
    settings: settingsLocales.th,
    setup: setupLocales.th,
    shifts: shiftsLocales.th,
  },
  en: {
    common: common.en,
    app: appLocales.en,
    auth: authLocales.en,
    branches: branchesLocales.en,
    categories: categoriesLocales.en,
    modifiers: modifiersLocales.en,
    tables: tablesLocales.en,
    users: usersLocales.en,
    pos: posLocales.en,
    products: productsLocales.en,
    sales: salesLocales.en,
    reports: reportsLocales.en,
    settings: settingsLocales.en,
    setup: setupLocales.en,
    shifts: shiftsLocales.en,
    errors: errors.en,
  },
}

const STORAGE_KEY = 'pos.locale'
const isLocale = (value: unknown): value is Locale => value === 'th' || value === 'en'

// The last language the shop used, so the sign-in page does not flash Thai before settings arrive.
const stored = localStorage.getItem(STORAGE_KEY)
const initial: Locale = isLocale(stored) ? stored : 'th'
document.documentElement.lang = initial

void i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: 'th',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

/** Switches the whole interface to the shop's language and remembers it for the next visit. */
export function applyLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale)
  document.documentElement.lang = locale
  return i18n.changeLanguage(locale)
}
