import {
  Answer,
  SessionState,
  SetVariableBlock,
  SetVariableHistoryItem,
  Variable,
} from '@sniper.io/schemas'
import { byId, isEmpty } from '@sniper.io/lib'
import { ExecuteLogicResponse } from '../../../types'
import { parseScriptToExecuteClientSideAction } from '../script/executeScript'
import { parseVariables } from '@sniper.io/variables/parseVariables'
import { updateVariablesInSession } from '@sniper.io/variables/updateVariablesInSession'
import { createId } from '@paralleldrive/cuid2'
import { utcToZonedTime, format as tzFormat } from 'date-fns-tz'
import {
  computeResultTranscript,
  parseTranscriptMessageText,
} from '@sniper.io/logic/computeResultTranscript'
import prisma from '@sniper.io/lib/prisma'
import { sessionOnlySetVariableOptions } from '@sniper.io/schemas/features/blocks/logic/setVariable/constants'
import { createCodeRunner } from '@sniper.io/variables/codeRunners'

export const executeSetVariable = async (
  state: SessionState,
  block: SetVariableBlock
): Promise<ExecuteLogicResponse> => {
  const { variables } = state.snipersQueue[0].sniper
  if (!block.options?.variableId)
    return {
      outgoingEdgeId: block.outgoingEdgeId,
    }
  const expressionToEvaluate = await getExpressionToEvaluate(state)(
    block.options,
    block.id
  )
  const isCustomValue = !block.options.type || block.options.type === 'Custom'
  if (
    expressionToEvaluate &&
    !state.whatsApp &&
    ((isCustomValue && block.options.isExecutedOnClient) ||
      block.options.type === 'Moment of the day')
  ) {
    const scriptToExecute = parseScriptToExecuteClientSideAction(
      variables,
      expressionToEvaluate
    )
    return {
      outgoingEdgeId: block.outgoingEdgeId,
      clientSideActions: [
        {
          type: 'setVariable',
          setVariable: {
            scriptToExecute,
          },
          expectsDedicatedReply: true,
        },
      ],
    }
  }
  const evaluatedExpression = expressionToEvaluate
    ? evaluateSetVariableExpression(variables)(expressionToEvaluate)
    : undefined
  const existingVariable = variables.find(byId(block.options.variableId))
  if (!existingVariable) return { outgoingEdgeId: block.outgoingEdgeId }
  const newVariable = {
    ...existingVariable,
    value: evaluatedExpression,
  }
  const { newSetVariableHistory, updatedState } = updateVariablesInSession({
    state,
    newVariables: [
      {
        ...newVariable,
        isSessionVariable: sessionOnlySetVariableOptions.includes(
          block.options.type as (typeof sessionOnlySetVariableOptions)[number]
        )
          ? true
          : newVariable.isSessionVariable,
      },
    ],
    currentBlockId: block.id,
  })

  return {
    outgoingEdgeId: block.outgoingEdgeId,
    newSessionState: updatedState,
    newSetVariableHistory,
  }
}

const evaluateSetVariableExpression =
  (variables: Variable[]) =>
  (str: string): unknown => {
    const isSingleVariable =
      str.startsWith('{{') && str.endsWith('}}') && str.split('{{').length === 2
    if (isSingleVariable) return parseVariables(variables)(str)
    // To avoid octal number evaluation
    if (!isNaN(str as unknown as number) && /0[^.].+/.test(str)) return str
    try {
      const body = parseVariables(variables, { fieldToParse: 'id' })(str)
      return createCodeRunner({ variables })(
        body.includes('return ') ? body : `return ${body}`
      )
    } catch (err) {
      return parseVariables(variables)(str)
    }
  }

const getExpressionToEvaluate =
  (state: SessionState) =>
  async (
    options: SetVariableBlock['options'],
    blockId: string
  ): Promise<string | null> => {
    switch (options?.type) {
      case 'Contact name':
        return state.whatsApp?.contact.name ?? null
      case 'Phone number': {
        const phoneNumber = state.whatsApp?.contact.phoneNumber
        return phoneNumber ? `"${state.whatsApp?.contact.phoneNumber}"` : null
      }
      case 'Now': {
        const timeZone = parseVariables(state.snipersQueue[0].sniper.variables)(
          options.timeZone
        )
        if (isEmpty(timeZone)) return 'new Date().toISOString()'
        return toISOWithTz(new Date(), timeZone)
      }

      case 'Today':
        return 'new Date().toISOString()'
      case 'Tomorrow': {
        const timeZone = parseVariables(state.snipersQueue[0].sniper.variables)(
          options.timeZone
        )
        if (isEmpty(timeZone))
          return 'new Date(Date.now() + 86400000).toISOString()'
        return toISOWithTz(new Date(Date.now() + 86400000), timeZone)
      }
      case 'Yesterday': {
        const timeZone = parseVariables(state.snipersQueue[0].sniper.variables)(
          options.timeZone
        )
        if (isEmpty(timeZone))
          return 'new Date(Date.now() - 86400000).toISOString()'
        return toISOWithTz(new Date(Date.now() - 86400000), timeZone)
      }
      case 'Random ID': {
        return `"${createId()}"`
      }
      case 'Result ID':
      case 'User ID': {
        return state.snipersQueue[0].resultId ?? `"${createId()}"`
      }
      case 'Map item with same index': {
        return `const itemIndex = ${options.mapListItemParams?.baseListVariableId}.indexOf(${options.mapListItemParams?.baseItemVariableId})
      return ${options.mapListItemParams?.targetListVariableId}.at(itemIndex)`
      }
      case 'Append value(s)': {
        return `if(!${options.item}) return ${options.variableId};
        if(!${options.variableId}) return [${options.item}];
        if(!Array.isArray(${options.variableId})) return [${options.variableId}, ${options.item}];
        return (${options.variableId}).concat(${options.item});`
      }
      case 'Empty': {
        return null
      }
      case 'Moment of the day': {
        return `const now = new Date()
        if(now.getHours() < 12) return 'morning'
        if(now.getHours() >= 12 && now.getHours() < 18) return 'afternoon'
        if(now.getHours() >= 18) return 'evening'
        if(now.getHours() >= 22 || now.getHours() < 6) return 'night'`
      }
      case 'Environment name': {
        return state.whatsApp ? 'whatsapp' : 'web'
      }
      case 'Transcript': {
        const props = await parseTranscriptProps(state)
        if (!props) return ''
        const sniperWithEmptyVariables = {
          ...state.snipersQueue[0].sniper,
          variables: state.snipersQueue[0].sniper.variables.map((v) => ({
            ...v,
            value: undefined,
          })),
        }
        const transcript = computeResultTranscript({
          sniper: sniperWithEmptyVariables,
          stopAtBlockId: blockId,
          ...props,
        })
        return (
          'return `' +
          transcript
            .map(
              (message) =>
                `${
                  message.role === 'bot' ? 'Assistant:' : 'User:'
                } "${parseTranscriptMessageText(message)}"`
            )
            .join('\n\n') +
          '`'
        )
      }
      case 'Custom':
      case undefined: {
        return options?.expressionToEvaluate ?? null
      }
    }
  }

const toISOWithTz = (date: Date, timeZone: string) => {
  const zonedDate = utcToZonedTime(date, timeZone)
  return tzFormat(zonedDate, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone })
}

type ParsedTranscriptProps = {
  answers: Pick<Answer, 'blockId' | 'content'>[]
  setVariableHistory: Pick<
    SetVariableHistoryItem,
    'blockId' | 'variableId' | 'value'
  >[]
  visitedEdges: string[]
}

const parseTranscriptProps = async (
  state: SessionState
): Promise<ParsedTranscriptProps | undefined> => {
  if (!state.snipersQueue[0].resultId) return parsePreviewTranscriptProps(state)
  return parseResultTranscriptProps(state)
}

const parsePreviewTranscriptProps = async (
  state: SessionState
): Promise<ParsedTranscriptProps | undefined> => {
  if (!state.previewMetadata) return
  return {
    answers: state.previewMetadata.answers ?? [],
    setVariableHistory: state.previewMetadata.setVariableHistory ?? [],
    visitedEdges: state.previewMetadata.visitedEdges ?? [],
  }
}

const parseResultTranscriptProps = async (
  state: SessionState
): Promise<ParsedTranscriptProps | undefined> => {
  const result = await prisma.result.findUnique({
    where: {
      id: state.snipersQueue[0].resultId,
    },
    select: {
      edges: {
        select: {
          edgeId: true,
          index: true,
        },
      },
      answers: {
        select: {
          blockId: true,
          content: true,
          createdAt: true,
        },
      },
      answersV2: {
        select: {
          blockId: true,
          content: true,
          createdAt: true,
        },
      },
      setVariableHistory: {
        select: {
          blockId: true,
          variableId: true,
          index: true,
          value: true,
        },
      },
    },
  })
  if (!result) return
  return {
    answers: result.answersV2
      .concat(result.answers)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    setVariableHistory: (
      result.setVariableHistory as SetVariableHistoryItem[]
    ).sort((a, b) => a.index - b.index),
    visitedEdges: result.edges
      .sort((a, b) => a.index - b.index)
      .map((edge) => edge.edgeId),
  }
}
