import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { useCartStore } from '../store/cart.store'
import { FloorView } from './FloorView'

/** The home screen when the shop chose the floor plan: pick a table, then take the order to the sell screen. */
export function FloorPage() {
  const { t } = useTranslation('pos')
  const navigate = useNavigate()
  const workOnOrder = useCartStore((state) => state.workOnOrder)

  return (
    <>
      <PageHeader title={t('floor.title')} description={t('floor.description')} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <FloorView
          onResume={(order) => {
            workOnOrder(order.id)
            navigate('/sell')
          }}
        />
      </div>
    </>
  )
}
