import { SessionState } from '@sniper.io/schemas'
import {
  ZemanticAiBlock,
  ZemanticAiCredentials,
  ZemanticAiResponse,
} from '@sniper.io/schemas/features/blocks/integrations/zemanticAi'
import ky from 'ky'
import { decrypt } from '@sniper.io/lib/api/encryption/decrypt'
import { byId, isDefined, isEmpty } from '@sniper.io/lib'
import { ExecuteIntegrationResponse } from '../../../types'
import { updateVariablesInSession } from '@sniper.io/variables/updateVariablesInSession'
import { getCredentials } from '../../../queries/getCredentials'
import { parseAnswers } from '@sniper.io/results/parseAnswers'

const URL = 'https://api.zemantic.ai/v1/search-documents'

export const executeZemanticAiBlock = async (
  state: SessionState,
  block: ZemanticAiBlock
): Promise<ExecuteIntegrationResponse> => {
  let newSessionState = state
  let setVariableHistory = []

  if (!block.options?.credentialsId)
    return {
      outgoingEdgeId: block.outgoingEdgeId,
    }

  const credentials = await getCredentials(block.options.credentialsId)

  if (!credentials) {
    return {
      outgoingEdgeId: block.outgoingEdgeId,
      logs: [
        {
          status: 'error',
          description: 'Make sure to select a Zemantic AI account',
        },
      ],
    }
  }
  const { apiKey } = (await decrypt(
    credentials.data,
    credentials.iv
  )) as ZemanticAiCredentials['data']

  const { sniper, answers } = newSessionState.snipersQueue[0]

  const templateVars = parseAnswers({
    variables: sniper.variables,
    answers: answers,
  })

  try {
    const res: ZemanticAiResponse = await ky
      .post(URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        json: {
          projectId: block.options.projectId,
          query: replaceTemplateVars(
            block.options.query as string,
            templateVars
          ),
          maxResults: block.options.maxResults,
          summarize: true,
          summaryOptions: {
            system_prompt:
              replaceTemplateVars(
                block.options.systemPrompt as string,
                templateVars
              ) ?? '',
            prompt:
              replaceTemplateVars(
                block.options.prompt as string,
                templateVars
              ) ?? '',
          },
        },
      })
      .json()

    for (const r of block.options.responseMapping || []) {
      const variable = sniper.variables.find(byId(r.variableId))
      let newVariables = []
      switch (r.valueToExtract) {
        case 'Summary':
          if (isDefined(variable) && !isEmpty(res.summary)) {
            newVariables.push({ ...variable, value: res.summary })
          }
          break
        case 'Results':
          if (isDefined(variable) && res.results.length) {
            newVariables.push({
              ...variable,
              value: JSON.stringify(res.results),
            })
          }
          break
        default:
          break
      }
      if (newVariables.length > 0) {
        const { newSetVariableHistory, updatedState } =
          updateVariablesInSession({
            newVariables,
            state: newSessionState,
            currentBlockId: block.id,
          })
        newSessionState = updatedState
        setVariableHistory.push(...newSetVariableHistory)
      }
    }
  } catch (e) {
    console.error(e)
    return {
      startTimeShouldBeUpdated: true,
      outgoingEdgeId: block.outgoingEdgeId,
      logs: [
        {
          status: 'error',
          description: 'Could not execute Zemantic AI request',
        },
      ],
      newSetVariableHistory: setVariableHistory,
    }
  }

  return {
    outgoingEdgeId: block.outgoingEdgeId,
    newSessionState,
    startTimeShouldBeUpdated: true,
  }
}

const replaceTemplateVars = (
  template: string,
  vars: Record<string, string>
) => {
  if (!template) return
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}
