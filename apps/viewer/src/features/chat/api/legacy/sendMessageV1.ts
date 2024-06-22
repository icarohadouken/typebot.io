import { publicProcedure } from '@/helpers/server/trpc'
import {
  sendMessageInputSchema,
  chatReplySchema,
} from '@sniper.io/schemas/features/chat/legacy/schema'
import { TRPCError } from '@trpc/server'
import { getSession } from '@sniper.io/bot-engine/queries/getSession'
import { startSession } from '@sniper.io/bot-engine/startSession'
import { saveStateToDatabase } from '@sniper.io/bot-engine/saveStateToDatabase'
import { restartSession } from '@sniper.io/bot-engine/queries/restartSession'
import { continueBotFlow } from '@sniper.io/bot-engine/continueBotFlow'
import { parseDynamicTheme } from '@sniper.io/bot-engine/parseDynamicTheme'
import { isDefined } from '@sniper.io/lib/utils'
import { BubbleBlockType } from '@sniper.io/schemas/features/blocks/bubbles/constants'

export const sendMessageV1 = publicProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/sendMessage',
      summary: 'Send a message',
      description:
        'To initiate a chat, do not provide a `sessionId` nor a `message`.\n\nContinue the conversation by providing the `sessionId` and the `message` that should answer the previous question.\n\nSet the `isPreview` option to `true` to chat with the non-published version of the sniper.',
      tags: ['Deprecated'],
      deprecated: true,
    },
  })
  .input(sendMessageInputSchema)
  .output(chatReplySchema)
  .mutation(
    async ({
      input: { sessionId, message, startParams, clientLogs },
      ctx: { user, origin, res },
    }) => {
      const session = sessionId ? await getSession(sessionId) : null

      const isSessionExpired =
        session &&
        isDefined(session.state.expiryTimeout) &&
        session.updatedAt.getTime() + session.state.expiryTimeout < Date.now()

      if (isSessionExpired)
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Session expired. You need to start a new session.',
        })

      if (!session) {
        if (!startParams)
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Missing startParams',
          })
        const {
          sniper,
          messages,
          input,
          resultId,
          dynamicTheme,
          logs,
          clientSideActions,
          newSessionState,
          visitedEdges,
          setVariableHistory,
        } = await startSession({
          version: 1,
          startParams:
            startParams.isPreview || typeof startParams.sniper !== 'string'
              ? {
                  type: 'preview',
                  isOnlyRegistering: startParams.isOnlyRegistering ?? false,
                  isStreamEnabled: startParams.isStreamEnabled ?? false,
                  startFrom:
                    'startGroupId' in startParams && startParams.startGroupId
                      ? {
                          type: 'group',
                          groupId: startParams.startGroupId,
                        }
                      : 'startEventId' in startParams &&
                        startParams.startEventId
                      ? {
                          type: 'event',
                          eventId: startParams.startEventId,
                        }
                      : undefined,
                  sniperId:
                    typeof startParams.sniper === 'string'
                      ? startParams.sniper
                      : startParams.sniper.id,
                  sniper:
                    typeof startParams.sniper === 'string'
                      ? undefined
                      : startParams.sniper,
                  message,
                  userId: user?.id,
                  textBubbleContentFormat: 'richText',
                }
              : {
                  type: 'live',
                  isOnlyRegistering: startParams.isOnlyRegistering ?? false,
                  isStreamEnabled: startParams.isStreamEnabled ?? false,
                  publicId: startParams.sniper,
                  prefilledVariables: startParams.prefilledVariables,
                  resultId: startParams.resultId,
                  message,
                  textBubbleContentFormat: 'richText',
                },
          message,
        })

        if (startParams.isPreview || typeof startParams.sniper !== 'string') {
          if (
            newSessionState.allowedOrigins &&
            newSessionState.allowedOrigins.length > 0
          ) {
            if (origin && newSessionState.allowedOrigins.includes(origin))
              res.setHeader('Access-Control-Allow-Origin', origin)
            else
              res.setHeader(
                'Access-Control-Allow-Origin',
                newSessionState.allowedOrigins[0]
              )
          }
        }

        const allLogs = clientLogs ? [...(logs ?? []), ...clientLogs] : logs

        const session = startParams?.isOnlyRegistering
          ? await restartSession({
              state: newSessionState,
            })
          : await saveStateToDatabase({
              session: {
                state: newSessionState,
              },
              input,
              logs: allLogs,
              clientSideActions,
              visitedEdges,
              hasEmbedBubbleWithWaitEvent: messages.some(
                (message) =>
                  message.type === 'custom-embed' ||
                  (message.type === BubbleBlockType.EMBED &&
                    message.content.waitForEvent?.isEnabled)
              ),
              setVariableHistory,
            })

        return {
          sessionId: session.id,
          sniper: sniper
            ? {
                id: sniper.id,
                theme: sniper.theme,
                settings: sniper.settings,
              }
            : undefined,
          messages,
          input,
          resultId,
          dynamicTheme,
          logs,
          clientSideActions,
        }
      } else {
        if (
          session.state.allowedOrigins &&
          session.state.allowedOrigins.length > 0
        ) {
          if (origin && session.state.allowedOrigins.includes(origin))
            res.setHeader('Access-Control-Allow-Origin', origin)
          else
            res.setHeader(
              'Access-Control-Allow-Origin',
              session.state.allowedOrigins[0]
            )
        }

        const {
          messages,
          input,
          clientSideActions,
          newSessionState,
          logs,
          lastMessageNewFormat,
          visitedEdges,
          setVariableHistory,
        } = await continueBotFlow(message, {
          version: 1,
          state: session.state,
          textBubbleContentFormat: 'richText',
        })

        const allLogs = clientLogs ? [...(logs ?? []), ...clientLogs] : logs

        if (newSessionState)
          await saveStateToDatabase({
            session: {
              id: session.id,
              state: newSessionState,
            },
            input,
            logs: allLogs,
            clientSideActions,
            visitedEdges,
            hasEmbedBubbleWithWaitEvent: messages.some(
              (message) =>
                message.type === 'custom-embed' ||
                (message.type === BubbleBlockType.EMBED &&
                  message.content.waitForEvent?.isEnabled)
            ),
            setVariableHistory,
          })

        return {
          messages,
          input,
          clientSideActions,
          dynamicTheme: parseDynamicTheme(newSessionState),
          logs,
          lastMessageNewFormat,
        }
      }
    }
  )
