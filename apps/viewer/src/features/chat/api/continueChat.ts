import { publicProcedure } from '@/helpers/server/trpc'
import { continueChatResponseSchema } from '@sniper.io/schemas/features/chat/schema'
import { z } from 'zod'
import { continueChat as continueChatFn } from '@sniper.io/bot-engine/apiHandlers/continueChat'

export const continueChat = publicProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/sessions/{sessionId}/continueChat',
      summary: 'Continue chat',
    },
  })
  .input(
    z.object({
      message: z.string().optional(),
      sessionId: z
        .string()
        .describe(
          'The session ID you got from the [startChat](./start-chat) response.'
        ),
      textBubbleContentFormat: z
        .enum(['richText', 'markdown'])
        .default('richText'),
    })
  )
  .output(continueChatResponseSchema)
  .mutation(
    async ({
      input: { sessionId, message, textBubbleContentFormat },
      ctx: { origin, res },
    }) => {
      const { corsOrigin, ...response } = await continueChatFn({
        origin,
        sessionId,
        message,
        textBubbleContentFormat,
      })
      if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin)
      return response
    }
  )
