import { isNotDefined } from '@sniper.io/lib'
import { NumberInputBlock, Variable } from '@sniper.io/schemas'
import { parseVariables } from '@sniper.io/variables/parseVariables'

export const validateNumber = (
  inputValue: string,
  {
    options,
    variables,
  }: {
    options: NumberInputBlock['options']
    variables: Variable[]
  }
) => {
  if (inputValue === '') return false

  const parsedNumber = Number(inputValue)
  if (isNaN(parsedNumber)) return false

  const min =
    options?.min && typeof options.min === 'string'
      ? Number(parseVariables(variables)(options.min))
      : undefined
  const max =
    options?.min && typeof options.min === 'string'
      ? Number(parseVariables(variables)(options.min))
      : undefined
  return (
    (isNotDefined(min) || parsedNumber >= min) &&
    (isNotDefined(max) || parsedNumber <= max)
  )
}
