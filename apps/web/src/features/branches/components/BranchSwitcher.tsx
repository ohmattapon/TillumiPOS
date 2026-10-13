import { Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActiveBranch } from '../hooks/use-active-branch'

/** Lets an owner pick the branch the till works in. Renders nothing when there is only one to pick. */
export function BranchSwitcher({ onSwitched }: { onSwitched?: () => void }) {
  const { t } = useTranslation('branches')
  const { branch, branches, canSwitch, switchTo } = useActiveBranch()

  if (!canSwitch || !branch) return null

  return (
    <Select
      value={String(branch.id)}
      onValueChange={(value) => {
        switchTo(Number(value))
        onSwitched?.()
      }}
    >
      <SelectTrigger aria-label={t('switcherLabel')} className="h-9! w-full bg-background">
        <Store className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {branches.map((item) => (
          <SelectItem key={item.id} value={String(item.id)}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
