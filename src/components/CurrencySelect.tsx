import { Dropdown } from '@/components/Form'
import { CURRENCY_VALUES } from '../../sanity/schemaTypes/constants'

const CURRENCY_OPTIONS = new Map(CURRENCY_VALUES.map((c) => [c, c]))

export function CurrencySelect({
  value,
  setValue,
  disabled,
  name = 'currency',
}: {
  value: string
  setValue: (val: string) => void
  disabled?: boolean
  name?: string
}) {
  return (
    <Dropdown
      name={name}
      options={CURRENCY_OPTIONS}
      value={value}
      setValue={setValue}
      disabled={disabled}
    />
  )
}
