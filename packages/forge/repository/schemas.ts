// Do not edit this file manually
import { anthropicBlock } from '@sniper.io/anthropic-block'
import { anthropicBlockSchema } from '@sniper.io/anthropic-block/schemas'
import { calComBlock } from '@sniper.io/cal-com-block'
import { calComBlockSchema } from '@sniper.io/cal-com-block/schemas'
import { chatNodeBlock } from '@sniper.io/chat-node-block'
import { chatNodeBlockSchema } from '@sniper.io/chat-node-block/schemas'
import { difyAiBlock } from '@sniper.io/dify-ai-block'
import { difyAiBlockSchema } from '@sniper.io/dify-ai-block/schemas'
import { elevenlabsBlock } from '@sniper.io/elevenlabs-block'
import { elevenlabsBlockSchema } from '@sniper.io/elevenlabs-block/schemas'
import { mistralBlock } from '@sniper.io/mistral-block'
import { mistralBlockSchema } from '@sniper.io/mistral-block/schemas'
import { openRouterBlock } from '@sniper.io/open-router-block'
import { openRouterBlockSchema } from '@sniper.io/open-router-block/schemas'
import { openAIBlock } from '@sniper.io/openai-block'
import { openAIBlockSchema } from '@sniper.io/openai-block/schemas'
import { qrCodeBlock } from '@sniper.io/qrcode-block'
import { qrCodeBlockSchema } from '@sniper.io/qrcode-block/schemas'
import { togetherAiBlock } from '@sniper.io/together-ai-block'
import { togetherAiBlockSchema } from '@sniper.io/together-ai-block/schemas'
import { zemanticAiBlock } from '@sniper.io/zemantic-ai-block'
import { zemanticAiBlockSchema } from '@sniper.io/zemantic-ai-block/schemas'
import { nocodbBlock } from '@sniper.io/nocodb-block'
import { nocodbBlockSchema } from '@sniper.io/nocodb-block/schemas'

export const forgedBlockSchemas = {
  [openAIBlock.id]: openAIBlockSchema,
  [zemanticAiBlock.id]: zemanticAiBlockSchema,
  [calComBlock.id]: calComBlockSchema,
  [chatNodeBlock.id]: chatNodeBlockSchema,
  [qrCodeBlock.id]: qrCodeBlockSchema,
  [difyAiBlock.id]: difyAiBlockSchema,
  [mistralBlock.id]: mistralBlockSchema,
  [elevenlabsBlock.id]: elevenlabsBlockSchema,
  [anthropicBlock.id]: anthropicBlockSchema,
  [togetherAiBlock.id]: togetherAiBlockSchema,
  [openRouterBlock.id]: openRouterBlockSchema,
  [nocodbBlock.id]: nocodbBlockSchema,
}
