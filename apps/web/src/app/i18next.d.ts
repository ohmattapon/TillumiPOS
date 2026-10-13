import 'i18next'
import type { errors } from '@/locales/errors'
import type { resources } from './i18n'

// Makes t('pos:cart.title') and friends type-checked against the Thai resources.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: (typeof resources)['th'] & { errors: (typeof errors)['en'] }
  }
}
