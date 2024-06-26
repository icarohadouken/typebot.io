import { hasProPerks } from '@/features/billing/helpers/hasProPerks'
import prisma from '@sniper.io/lib/prisma'
import { Plan } from '@sniper.io/prisma'
import { Block, Sniper } from '@sniper.io/schemas'
import { IntegrationBlockType } from '@sniper.io/schemas/features/blocks/integrations/constants'
import { defaultSendEmailOptions } from '@sniper.io/schemas/features/blocks/integrations/sendEmail/constants'
import { LogicBlockType } from '@sniper.io/schemas/features/blocks/logic/constants'
import { sessionOnlySetVariableOptions } from '@sniper.io/schemas/features/blocks/logic/setVariable/constants'
import { isInputBlock } from '@sniper.io/schemas/helpers'

export const sanitizeSettings = (
  settings: Sniper['settings'],
  workspacePlan: Plan,
  mode: 'create' | 'update'
): Sniper['settings'] => ({
  ...settings,
  publicShare: mode === 'create' ? undefined : settings.publicShare,
  general:
    workspacePlan === Plan.FREE || settings.general
      ? {
          ...settings.general,
          isBrandingEnabled:
            workspacePlan === Plan.FREE
              ? true
              : settings.general?.isBrandingEnabled,
        }
      : undefined,
  whatsApp: settings.whatsApp
    ? {
        ...settings.whatsApp,
        isEnabled:
          mode === 'create'
            ? false
            : hasProPerks({ plan: workspacePlan })
            ? settings.whatsApp.isEnabled
            : false,
      }
    : undefined,
})

export const sanitizeGroups =
  (workspaceId: string) =>
  async (groups: Sniper['groups']): Promise<Sniper['groups']> =>
    Promise.all(
      groups.map(async (group) => ({
        ...group,
        blocks: await Promise.all(group.blocks.map(sanitizeBlock(workspaceId))),
      }))
    ) as Promise<Sniper['groups']>

const sanitizeBlock =
  (workspaceId: string) =>
  async (block: Block): Promise<Block> => {
    if (!('options' in block) || !block.options) return block

    if (!('credentialsId' in block.options) || !block.options.credentialsId)
      return block

    switch (block.type) {
      case IntegrationBlockType.EMAIL:
        return {
          ...block,
          options: {
            ...block.options,
            credentialsId:
              (await sanitizeCredentialsId(workspaceId)(
                block.options?.credentialsId
              )) ?? defaultSendEmailOptions.credentialsId,
          },
        }
      default:
        return {
          ...block,
          options: {
            ...block.options,
            credentialsId: await sanitizeCredentialsId(workspaceId)(
              block.options?.credentialsId
            ),
          },
        }
    }
  }

const sanitizeCredentialsId =
  (workspaceId: string) =>
  async (credentialsId?: string): Promise<string | undefined> => {
    if (!credentialsId) return
    const credentials = await prisma.credentials.findFirst({
      where: {
        id: credentialsId,
        workspaceId,
      },
      select: {
        id: true,
      },
    })
    return credentials?.id
  }

export const isPublicIdNotAvailable = async (publicId: string) => {
  const sniperWithSameIdCount = await prisma.sniper.count({
    where: {
      publicId,
    },
  })
  return sniperWithSameIdCount > 0
}

export const isCustomDomainNotAvailable = async ({
  customDomain,
  workspaceId,
}: {
  customDomain: string
  workspaceId: string
}) => {
  const domainCount = await prisma.customDomain.count({
    where: {
      workspaceId,
      name: customDomain.split('/')[0],
    },
  })
  if (domainCount === 0) return true

  const sniperWithSameDomainCount = await prisma.sniper.count({
    where: {
      customDomain,
    },
  })

  return sniperWithSameDomainCount > 0
}

export const sanitizeFolderId = async ({
  folderId,
  workspaceId,
}: {
  folderId: string | null
  workspaceId: string
}) => {
  if (!folderId) return
  const folderCount = await prisma.dashboardFolder.count({
    where: {
      id: folderId,
      workspaceId,
    },
  })
  return folderCount !== 0 ? folderId : undefined
}

export const sanitizeCustomDomain = async ({
  customDomain,
  workspaceId,
}: {
  customDomain?: string | null
  workspaceId: string
}) => {
  if (!customDomain) return customDomain
  const domainCount = await prisma.customDomain.count({
    where: {
      name: customDomain?.split('/')[0],
      workspaceId,
    },
  })
  return domainCount === 0 ? null : customDomain
}

export const sanitizeVariables = ({
  variables,
  groups,
}: Pick<Sniper, 'variables' | 'groups'>): Sniper['variables'] => {
  const blocks = groups
    .flatMap((group) => group.blocks as Block[])
    .filter((b) => isInputBlock(b) || b.type === LogicBlockType.SET_VARIABLE)
  return variables.map((variable) => {
    if (variable.isSessionVariable) return variable
    const isVariableLinkedToInputBlock = blocks.some(
      (block) =>
        isInputBlock(block) && block.options?.variableId === variable.id
    )
    if (isVariableLinkedToInputBlock)
      return {
        ...variable,
        isSessionVariable: true,
      }
    const isVariableSetToForbiddenResultVar = blocks.some(
      (block) =>
        block.type === LogicBlockType.SET_VARIABLE &&
        block.options?.variableId === variable.id &&
        sessionOnlySetVariableOptions.includes(
          block.options.type as (typeof sessionOnlySetVariableOptions)[number]
        )
    )
    if (isVariableSetToForbiddenResultVar)
      return {
        ...variable,
        isSessionVariable: true,
      }
    return variable
  })
}
