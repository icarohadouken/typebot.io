import { parseVideoUrl } from '@sniper.io/schemas/features/blocks/bubbles/video/helpers'
import {
  BubbleBlock,
  Variable,
  ContinueChatResponse,
  Sniper,
} from '@sniper.io/schemas'
import { deepParseVariables } from '@sniper.io/variables/deepParseVariables'
import { isDefined, isEmpty, isNotEmpty } from '@sniper.io/lib/utils'
import {
  getVariablesToParseInfoInText,
  parseVariables,
} from '@sniper.io/variables/parseVariables'
import { TDescendant, TElement } from '@udecode/plate-common'
import { BubbleBlockType } from '@sniper.io/schemas/features/blocks/bubbles/constants'
import { defaultVideoBubbleContent } from '@sniper.io/schemas/features/blocks/bubbles/video/constants'
import { convertMarkdownToRichText } from '@sniper.io/lib/markdown/convertMarkdownToRichText'
import { convertRichTextToMarkdown } from '@sniper.io/lib/markdown/convertRichTextToMarkdown'

type Params = {
  version: 1 | 2
  sniperVersion: Sniper['version']
  variables: Variable[]
  textBubbleContentFormat: 'richText' | 'markdown'
}

export type BubbleBlockWithDefinedContent = BubbleBlock & {
  content: NonNullable<BubbleBlock['content']>
}

export const parseBubbleBlock = (
  block: BubbleBlockWithDefinedContent,
  { version, variables, sniperVersion, textBubbleContentFormat }: Params
): ContinueChatResponse['messages'][0] => {
  switch (block.type) {
    case BubbleBlockType.TEXT: {
      if (version === 1)
        return {
          ...block,
          content: {
            type: 'richText',
            richText: (block.content?.richText ?? []).map(
              deepParseVariables(variables)
            ),
          },
        }

      const richText = parseVariablesInRichText(block.content?.richText ?? [], {
        variables,
        takeLatestIfList: sniperVersion !== '6',
      }).parsedElements
      return {
        ...block,
        content:
          textBubbleContentFormat === 'richText'
            ? {
                type: 'richText',
                richText,
              }
            : {
                type: 'markdown',
                markdown: convertRichTextToMarkdown(richText as TElement[]),
              },
      }
    }

    case BubbleBlockType.EMBED: {
      const message = deepParseVariables(variables, {
        removeEmptyStrings: true,
      })(block)
      return {
        ...message,
        content: {
          ...message.content,
          height:
            typeof message.content?.height === 'string'
              ? parseFloat(message.content.height)
              : message.content?.height,
        },
      }
    }
    case BubbleBlockType.VIDEO: {
      const parsedContent = block.content
        ? deepParseVariables(variables, { removeEmptyStrings: true })(
            block.content
          )
        : undefined

      return {
        ...block,
        content: {
          ...parsedContent,
          ...(parsedContent?.url ? parseVideoUrl(parsedContent.url) : {}),
          height:
            typeof parsedContent?.height === 'string'
              ? parseFloat(parsedContent.height)
              : defaultVideoBubbleContent.height,
        },
      }
    }
    default:
      return deepParseVariables(variables, { removeEmptyStrings: true })(block)
  }
}

export const parseVariablesInRichText = (
  elements: TDescendant[],
  {
    variables,
    takeLatestIfList,
  }: { variables: Variable[]; takeLatestIfList?: boolean }
): { parsedElements: TDescendant[]; parsedVariableIds: string[] } => {
  const parsedElements: TDescendant[] = []
  const parsedVariableIds: string[] = []
  for (const element of elements) {
    if ('text' in element) {
      const text = element.text as string
      if (isEmpty(text)) {
        parsedElements.push(element)
        continue
      }
      const variablesInText = getVariablesToParseInfoInText(text, {
        variables,
        takeLatestIfList,
      })
      parsedVariableIds.push(
        ...variablesInText.map((v) => v.variableId).filter(isDefined)
      )
      if (variablesInText.length === 0) {
        parsedElements.push(element)
        continue
      }
      let lastTextEndIndex = 0
      let index = -1
      for (const variableInText of variablesInText) {
        index += 1
        const textBeforeVariable = text.substring(
          lastTextEndIndex,
          variableInText.startIndex
        )
        const textAfterVariable =
          index === variablesInText.length - 1
            ? text.substring(variableInText.endIndex)
            : undefined
        lastTextEndIndex = variableInText.endIndex
        const isStandaloneElement =
          isEmpty(textBeforeVariable) && isEmpty(textAfterVariable)
        const variableElements = convertMarkdownToRichText(
          isStandaloneElement
            ? variableInText.value
            : variableInText.value.replace(/[\n]+/g, ' ')
        )

        const variableElementsWithStyling = applyElementStyleToDescendants(
          variableElements,
          {
            bold: element.bold,
            italic: element.italic,
            underline: element.underline,
          }
        )

        if (
          isStandaloneElement &&
          !element.bold &&
          !element.italic &&
          !element.underline
        ) {
          parsedElements.push(...variableElementsWithStyling)
          continue
        }
        const children: TDescendant[] = []
        if (isNotEmpty(textBeforeVariable))
          children.push({
            ...element,
            text: textBeforeVariable,
          })
        children.push({
          type: 'inline-variable',
          children: variableElementsWithStyling,
        })
        if (isNotEmpty(textAfterVariable))
          children.push({
            ...element,
            text: textAfterVariable,
          })
        parsedElements.push(...children)
      }

      continue
    }

    const type =
      element.children.length === 1 &&
      'text' in element.children[0] &&
      (element.children[0].text as string).startsWith('{{') &&
      (element.children[0].text as string).endsWith('}}') &&
      element.type !== 'a'
        ? 'variable'
        : element.type

    const {
      parsedElements: parsedChildren,
      parsedVariableIds: parsedChildrenVariableIds,
    } = parseVariablesInRichText(element.children as TDescendant[], {
      variables,
      takeLatestIfList,
    })

    parsedVariableIds.push(...parsedChildrenVariableIds)
    parsedElements.push({
      ...element,
      url: element.url
        ? parseVariables(variables)(element.url as string)
        : undefined,
      type,
      children: parsedChildren,
    })
  }
  return {
    parsedElements,
    parsedVariableIds,
  }
}

const applyElementStyleToDescendants = (
  variableElements: TDescendant[],
  styles: { bold: unknown; italic: unknown; underline: unknown }
): TDescendant[] =>
  variableElements.map((variableElement) => {
    if ('text' in variableElement) return { ...styles, ...variableElement }
    return {
      ...variableElement,
      children: applyElementStyleToDescendants(
        variableElement.children,
        styles
      ),
    }
  })
