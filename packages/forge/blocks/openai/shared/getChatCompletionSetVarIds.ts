import { isDefined } from '@sniper.io/lib'
import { ChatCompletionOptions } from './parseChatCompletionOptions'

export const getChatCompletionSetVarIds = (options: ChatCompletionOptions) =>
  options.responseMapping?.map((res) => res.variableId).filter(isDefined) ?? []
