import { ShortTextInput } from '@/components'
import { SendButton } from '@/components/SendButton'
import { CommandData } from '@/features/commands/types'
import { InputSubmitContent } from '@/types'
import { isMobile } from '@/utils/isMobileSignal'
import type { EmailInputBlock } from '@sniper.io/schemas'
import { createSignal, onCleanup, onMount } from 'solid-js'
import { defaultEmailInputOptions } from '@sniper.io/schemas/features/blocks/inputs/email/constants'

type Props = {
  block: EmailInputBlock
  defaultValue?: string
  onSubmit: (value: InputSubmitContent) => void
}

export const EmailInput = (props: Props) => {
  const [inputValue, setInputValue] = createSignal(props.defaultValue ?? '')
  let inputRef: HTMLInputElement | undefined

  const handleInput = (inputValue: string) => setInputValue(inputValue)

  const checkIfInputIsValid = () =>
    inputRef?.value !== '' && inputRef?.reportValidity()

  const submit = () => {
    if (checkIfInputIsValid())
      props.onSubmit({ value: inputRef?.value ?? inputValue() })
    else inputRef?.focus()
  }

  const submitWhenEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') submit()
  }

  onMount(() => {
    if (!isMobile() && inputRef) inputRef.focus({ preventScroll: true })
    window.addEventListener('message', processIncomingEvent)
  })

  onCleanup(() => {
    window.removeEventListener('message', processIncomingEvent)
  })

  const processIncomingEvent = (event: MessageEvent<CommandData>) => {
    const { data } = event
    if (!data.isFromSniper) return
    if (data.command === 'setInputValue') setInputValue(data.value)
  }

  return (
    <div
      class={'flex items-end justify-between pr-2 sniper-input w-full'}
      data-testid="input"
      style={{
        'max-width': '350px',
      }}
      onKeyDown={submitWhenEnter}
    >
      <ShortTextInput
        ref={inputRef}
        value={inputValue()}
        placeholder={
          props.block.options?.labels?.placeholder ??
          defaultEmailInputOptions.labels.placeholder
        }
        onInput={handleInput}
        type="email"
        autocomplete="email"
      />
      <SendButton type="button" class="my-2 ml-2" on:click={submit}>
        {props.block.options?.labels?.button}
      </SendButton>
    </div>
  )
}
