import { publicProcedure } from '@/helpers/server/trpc'
import {
  startChatInputSchema,
  startChatResponseSchema,
} from '@sniper.io/schemas/features/chat/schema'
import { startChat as startChatFn } from '@sniper.io/bot-engine/apiHandlers/startChat'

export const startChat = publicProcedure
  .meta({
    openapi: {
      method: 'POST',
      path: '/v1/snipers/{publicId}/startChat',
      summary: 'Start chat',
    },
  })
  .input(startChatInputSchema)
  .output(startChatResponseSchema)
  .mutation(async ({ input, ctx: { origin, res } }) => {
    const { corsOrigin, ...response } = await startChatFn({
      ...input,
      origin,
    })
    if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    return response
  })
