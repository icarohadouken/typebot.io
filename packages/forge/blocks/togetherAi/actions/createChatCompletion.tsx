import { createAction } from '@sniper.io/forge'
import { auth } from '../auth'
import { parseChatCompletionOptions } from '@sniper.io/openai-block/shared/parseChatCompletionOptions'
import { getChatCompletionSetVarIds } from '@sniper.io/openai-block/shared/getChatCompletionSetVarIds'
import { getChatCompletionStreamVarId } from '@sniper.io/openai-block/shared/getChatCompletionStreamVarId'
import { runChatCompletion } from '@sniper.io/openai-block/shared/runChatCompletion'
import { runChatCompletionStream } from '@sniper.io/openai-block/shared/runChatCompletionStream'
import { defaultTogetherOptions } from '../constants'

export const createChatCompletion = createAction({
  name: 'Create chat completion',
  auth,
  options: parseChatCompletionOptions({
    modelHelperText:
      'You can find the list of all the models available [here](https://docs.together.ai/docs/inference-models#chat-models). Copy the model string for API.',
  }),
  turnableInto: [
    {
      blockId: 'openai',
    },
    {
      blockId: 'open-router',
    },
    { blockId: 'mistral' },
    {
      blockId: 'anthropic',
      transform: (options) => ({
        ...options,
        model: undefined,
        action: 'Create Chat Message',
        responseMapping: options.responseMapping?.map((res: any) =>
          res.item === 'Message content'
            ? { ...res, item: 'Message Content' }
            : res
        ),
      }),
    },
  ],
  getSetVariableIds: getChatCompletionSetVarIds,
  run: {
    server: (params) =>
      runChatCompletion({
        ...params,
        config: { baseUrl: defaultTogetherOptions.baseUrl },
      }),
    stream: {
      getStreamVariableId: getChatCompletionStreamVarId,
      run: async (params) => ({
        stream: await runChatCompletionStream({
          ...params,
          config: { baseUrl: defaultTogetherOptions.baseUrl },
        }),
      }),
    },
  },
})
