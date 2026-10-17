import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

export const MAX_GROUP_SELECTIONS = 20
const MAX_NAME_LENGTH = 100

const invalid = (message: string) => new DomainError(message, 'INVALID_MODIFIER')
const isName = (value: string) => value.length >= 1 && value.length <= MAX_NAME_LENGTH
const isMoney = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT_SATANG
const definedOnly = <T extends object>(changes: T) =>
  Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as T

export interface ModifierGroupProps {
  /** 0 until the group has been stored. */
  id: number
  name: string
  /** At least one option must be chosen. */
  required: boolean
  /** 1 = pick one; more = pick up to this many. */
  maxSelections: number
  sortOrder: number
  isActive: boolean
}

export class ModifierGroupEntity {
  public readonly id: number
  public readonly name: string
  public readonly required: boolean
  public readonly maxSelections: number
  public readonly sortOrder: number
  public readonly isActive: boolean

  constructor(props: ModifierGroupProps) {
    if (!isName(props.name)) throw invalid(`ชื่อกลุ่มตัวเลือกต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`)
    if (!Number.isInteger(props.maxSelections) || props.maxSelections < 1 || props.maxSelections > MAX_GROUP_SELECTIONS)
      throw invalid(`จำนวนที่เลือกได้สูงสุดต้องเป็นจำนวนเต็ม 1 ถึง ${MAX_GROUP_SELECTIONS}`)
    if (!Number.isInteger(props.sortOrder)) throw invalid('ลำดับการแสดงผลต้องเป็นจำนวนเต็ม')

    this.id = props.id
    this.name = props.name
    this.required = props.required
    this.maxSelections = props.maxSelections
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
  }

  /** A copy with the given fields changed; undefined fields keep their current value. */
  with(changes: Partial<Omit<ModifierGroupProps, 'id'>>): ModifierGroupEntity {
    return new ModifierGroupEntity({ ...this.toSnapshot(), ...definedOnly(changes) })
  }

  toSnapshot(): ModifierGroupProps {
    return {
      id: this.id,
      name: this.name,
      required: this.required,
      maxSelections: this.maxSelections,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
    }
  }
}

export interface ModifierOptionProps {
  /** 0 until the option has been stored. */
  id: number
  groupId: number
  name: string
  /** Added to the unit price of the line, satang. */
  priceSatang: number
  /** Added to the unit cost of the line, satang. */
  costSatang: number
  sortOrder: number
  isActive: boolean
  /** Chosen for the cashier before they touch anything; the till sends it like any other choice. */
  isDefault: boolean
}

export class ModifierOptionEntity {
  public readonly id: number
  public readonly groupId: number
  public readonly name: string
  public readonly priceSatang: number
  public readonly costSatang: number
  public readonly sortOrder: number
  public readonly isActive: boolean
  public readonly isDefault: boolean

  constructor(props: ModifierOptionProps) {
    if (!isName(props.name)) throw invalid(`ชื่อตัวเลือกต้องยาว 1 ถึง ${MAX_NAME_LENGTH} ตัวอักษร`)
    if (!isMoney(props.priceSatang) || !isMoney(props.costSatang))
      throw invalid('ราคาเพิ่มและต้นทุนต้องเป็นจำนวนเต็มสตางค์ที่ไม่ติดลบ')
    if (!Number.isInteger(props.sortOrder)) throw invalid('ลำดับการแสดงผลต้องเป็นจำนวนเต็ม')

    this.id = props.id
    this.groupId = props.groupId
    this.name = props.name
    this.priceSatang = props.priceSatang
    this.costSatang = props.costSatang
    this.sortOrder = props.sortOrder
    this.isActive = props.isActive
    // A snapshot read from a cache written before the flag existed has no value for it.
    this.isDefault = props.isDefault ?? false
  }

  with(changes: Partial<Omit<ModifierOptionProps, 'id' | 'groupId'>>): ModifierOptionEntity {
    return new ModifierOptionEntity({ ...this.toSnapshot(), ...definedOnly(changes) })
  }

  toSnapshot(): ModifierOptionProps {
    return {
      id: this.id,
      groupId: this.groupId,
      name: this.name,
      priceSatang: this.priceSatang,
      costSatang: this.costSatang,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
      isDefault: this.isDefault,
    }
  }
}

/** One chosen option, kept on an order or sale line exactly as it was when it was chosen. */
export interface LineOption {
  groupId: number
  groupName: string
  optionId: number
  name: string
  priceSatang: number
  costSatang: number
}

/** The part of a group the rules read; entities and the web's plain objects both satisfy it. */
export type GroupRules = Pick<ModifierGroupProps, 'id' | 'name' | 'required' | 'maxSelections' | 'isActive'>
export type OptionData = Pick<
  ModifierOptionProps,
  'id' | 'name' | 'priceSatang' | 'costSatang' | 'isActive' | 'isDefault'
>
export interface ModifierGroupWithOptions {
  group: GroupRules
  options: readonly OptionData[]
}

export interface ResolvedLineOptions {
  /** In group order, then option order. */
  options: LineOption[]
  priceSatang: number
  costSatang: number
  key: string
}

/** Identifies the choice on a line: the same product with the same options is the same line. */
export function lineKey(options: readonly { optionId: number }[]): string {
  return options
    .map((option) => option.optionId)
    .sort((a, b) => a - b)
    .join('-')
}

/**
 * What the till starts a line with: the flagged default of every active group, in group order. At
 * most one per group, so a group can never add two answers by itself. A default is a choice the till
 * makes on the cashier's behalf and sends like any other; `resolveLineOptions` stays the one place
 * the rules are enforced.
 */
export function defaultOptionIds(groups: readonly ModifierGroupWithOptions[]): number[] {
  const picked: number[] = []
  for (const { group, options } of groups) {
    if (!group.isActive) continue
    const option = options.find((candidate) => candidate.isDefault && candidate.isActive)
    if (option) picked.push(option.id)
  }
  return picked
}

/**
 * The one rule for what may be chosen on a product, shared by the server and the till. `groups` are
 * the groups offered on the product; `selectedOptionIds` what was chosen. Throws a DomainError that
 * names the group when the choice breaks a rule.
 */
export function resolveLineOptions(
  groups: readonly ModifierGroupWithOptions[],
  selectedOptionIds: readonly number[],
): ResolvedLineOptions {
  const chosen = new Set<number>()
  for (const id of selectedOptionIds) {
    if (chosen.has(id)) throw new DomainError('เลือกตัวเลือกเดียวกันซ้ำไม่ได้', 'MODIFIER_DUPLICATE')
    chosen.add(id)
  }

  const offered = new Map<number, { group: GroupRules; option: OptionData }>()
  for (const { group, options } of groups) for (const option of options) offered.set(option.id, { group, option })
  for (const id of chosen) {
    const found = offered.get(id)
    if (!found || !found.group.isActive || !found.option.isActive)
      throw new DomainError('ตัวเลือกนี้ใช้กับสินค้านี้ไม่ได้', 'MODIFIER_NOT_AVAILABLE', { optionId: id })
  }

  const resolved: LineOption[] = []
  for (const { group, options } of groups) {
    if (!group.isActive) continue
    const picked = options.filter((option) => chosen.has(option.id))
    if (group.required && picked.length === 0)
      throw new DomainError(`กรุณาเลือก "${group.name}"`, 'MODIFIER_REQUIRED', { group: group.name })
    if (picked.length > group.maxSelections)
      throw new DomainError(
        `"${group.name}" เลือกได้ไม่เกิน ${group.maxSelections} อย่าง`,
        'MODIFIER_TOO_MANY',
        { group: group.name, max: group.maxSelections },
      )
    for (const option of picked)
      resolved.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        name: option.name,
        priceSatang: option.priceSatang,
        costSatang: option.costSatang,
      })
  }

  return {
    options: resolved,
    priceSatang: resolved.reduce((total, option) => total + option.priceSatang, 0),
    costSatang: resolved.reduce((total, option) => total + option.costSatang, 0),
    key: lineKey(resolved),
  }
}
