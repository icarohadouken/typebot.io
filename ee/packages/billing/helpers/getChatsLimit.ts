import { Plan } from '@sniper.io/prisma'
import { chatsLimits } from '../constants'
import { Workspace } from '@sniper.io/schemas'

export const getChatsLimit = ({
  plan,
  customChatsLimit,
}: Pick<Workspace, 'plan'> & {
  customChatsLimit?: Workspace['customChatsLimit']
}) => {
  if (
    plan === Plan.UNLIMITED ||
    plan === Plan.LIFETIME ||
    plan === Plan.OFFERED
  )
    return 'inf'
  if (plan === Plan.CUSTOM) return customChatsLimit ?? 'inf'
  return chatsLimits[plan]
}
