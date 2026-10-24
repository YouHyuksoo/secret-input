import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SecretRequest } from '../types'

const PANE = 'secret-input'
const TOOL = 'request_secret'
const OWN_TOOL = 'mcp__secret-input__request_secret'
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const PLACEHOLDER = /\{\{secret:([A-Za-z][A-Za-z0-9_]{0,39})\}\}/g

const names = atom({ plugin: 'secret-input', key: 'names' } as const, [] as string[], {
  shape: 'names-1',
})
const request = atom(
  { plugin: 'secret-input', key: 'request' } as const,
  null as SecretRequest | null,
  { shape: 'request-1' },
)

// Values live in module memory only: any plugin can read $.state, and $.store
// is plain JSON on disk. So a reload or a restart drops them.
const secrets = new Map<string, string>()

// The model reads this one; it stays in English whatever the language option.
const TOOL_DESCRIPTION = [
  'Ask the user for a secret (password, token, API key) through a private input pane,',
  'so the value never enters the chat. Use this instead of asking the user to paste a secret in chat.',
  'It returns at once: end your turn and wait; a message arrives when the user has saved it.',
  "Then write '{{secret:NAME}}' in a Bash or PowerShell command, always inside single quotes;",
  'the value is put in when the command runs and masked as [secret:NAME] in the output.',
  'You never see the value: do not try to print, save or read it back.',
].join(' ')

const TEXT = {
  en: {
    commandDescription: 'Enter a secret in a private pane instead of the chat (/secret NAME, /secret, /secret --clear)',
    argumentHint: '[NAME|--clear]',
    paneTitle: (name: string) => `Secret: ${name}`,
    noneSaved: 'No secrets saved. Run /secret NAME to add one.',
    savedList: (list: string) => `Saved: ${list}`,
    cleared: 'All saved secrets were cleared.',
    badName: (name: string) => `A name starts with a letter and uses only letters, digits and _: ${name}`,
    opened: (name: string) => `Opened the input pane for ${name}. The value stays out of the chat.`,
    empty: 'An empty value is not saved.',
    savedToast: (name: string, length: number) => `${name} saved (${length} characters)`,
    savedNote: (name: string) =>
      `[secret-input] ${name} has been entered. Write '{{secret:${name}}}' in a command; the value stays hidden.`,
    cancelNote: (name: string) => `[secret-input] The user cancelled entering ${name}.`,
    mobile: 'This surface has no input field. Run /secret NAME in the terminal.',
    idle: 'No secret was requested. Run /secret NAME to open one.',
    inputLabel: 'Value ',
    placeholder: 'Paste here, then Enter',
    submitLabel: 'save',
    warning: 'Not sent to the chat or the model. Visible in this pane until Enter.',
    cancel: 'Cancel',
  },
  ko: {
    commandDescription: '비밀값을 채팅 대신 전용 입력창으로 넣기 (/secret 이름, /secret, /secret --clear)',
    argumentHint: '[이름|--clear]',
    paneTitle: (name: string) => `비밀값 입력: ${name}`,
    noneSaved: '저장된 비밀값이 없어요. /secret 이름 으로 넣으세요.',
    savedList: (list: string) => `저장됨: ${list}`,
    cleared: '저장된 비밀값을 모두 지웠어요.',
    badName: (name: string) => `이름은 영문으로 시작하고 영문·숫자·_ 만 써요: ${name}`,
    opened: (name: string) => `${name} 입력창을 열었어요. 값은 채팅에 남지 않아요.`,
    empty: '빈 값은 저장하지 않아요.',
    savedToast: (name: string, length: number) => `${name} 저장됨 (${length}자)`,
    savedNote: (name: string) =>
      `[secret-input] ${name} 입력이 끝났습니다. 명령에 '{{secret:${name}}}' 로 쓰세요. 값은 보이지 않습니다.`,
    cancelNote: (name: string) => `[secret-input] 사용자가 ${name} 입력을 취소했습니다.`,
    mobile: '이 화면에는 입력창이 없어요. 터미널에서 /secret 이름 으로 넣으세요.',
    idle: '요청된 비밀값이 없어요. /secret 이름 으로 여세요.',
    inputLabel: '값 ',
    placeholder: '여기에 붙여넣고 Enter',
    submitLabel: '저장',
    warning: '채팅·모델에는 보내지 않아요. Enter 전까지 이 창에는 보여요.',
    cancel: '취소',
  },
} as const

// The model writes the placeholder inside single quotes: escape the value per shell.
const quoteFor = (tool: string, value: string) =>
  tool === 'PowerShell'
    ? value.replace(/['\u2018\u2019\u201A\u201B]/g, quote => quote + quote)
    : value.replace(/'/g, `'\\''`)

// Mask the value and its escaped forms (an error message may repeat the command).
// Longest first, so a value that holds another one wins.
const masks = () =>
  [...secrets]
    .flatMap(([name, value]) =>
      [...new Set([value, quoteFor('Bash', value), quoteFor('PowerShell', value)])].map(
        form => [name, form] as const,
      ),
    )
    .sort((a, b) => b[1].length - a[1].length)

const redactText = (text: string) =>
  masks().reduce((out, [name, form]) => out.split(form).join(`[secret:${name}]`), text)

const hasSecret = (value: unknown): boolean => {
  if (typeof value === 'string') return masks().some(([, form]) => value.includes(form))
  if (Array.isArray(value)) return value.some(hasSecret)
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasSecret)
  return false
}

const redactDeep = (value: unknown): unknown => {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item)]))
  }
  return value
}

type Words = (typeof TEXT)[keyof typeof TEXT]

const openPane = ($: EngineInterface, t: Words, name: string) =>
  $.ui.open({ id: PANE, title: t.paneTitle(name), focus: true, closeOnEscape: true, rows: 7 })

const finish = async ($: EngineInterface, req: SecretRequest, note: string) => {
  await update($, request, () => null)
  await $.ui.close({ id: PANE })
  if (req.isFromModel) await $.prompt.submit({ text: note })
}

const save = async ($: EngineInterface, t: Words, req: SecretRequest, typed: string) => {
  const value = typed.replace(/[\r\n]+$/, '')
  if (value === '') {
    $.ui.toast(t.empty)
    return
  }
  secrets.set(req.name, value)
  await update($, names, list => [...new Set([...list, req.name])])
  $.ui.toast(t.savedToast(req.name, value.length))
  await finish($, req, t.savedNote(req.name))
}

const cancel = ($: EngineInterface, t: Words, req: SecretRequest) => finish($, req, t.cancelNote(req.name))

export const register: Register = (on, options) => {
  const t = options.language === 'ko' ? TEXT.ko : TEXT.en

  on('session.start', async ($, e, next) => {
    // A reload empties the values, so empty the list of names too.
    await update($, names, () => [])
    await $.tool.register({
      name: TOOL,
      description: TOOL_DESCRIPTION,
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Letters, digits, _; starts with a letter (DB_PASSWORD)' },
          reason: { type: 'string', description: 'One line telling the user what it is for' },
        },
        required: ['name'],
      },
    })
    await $.command.register({
      name: 'secret',
      description: t.commandDescription,
      argumentHint: t.argumentHint,
    })

    return next(e)
  })

  on('command.run', { command: 'secret' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') {
      const list = [...secrets.keys()]
      return { text: list.length === 0 ? t.noneSaved : t.savedList(list.join(', ')) }
    }
    if (arg === '--clear') {
      secrets.clear()
      await update($, names, () => [])
      return { text: t.cleared }
    }
    if (!NAME.test(arg)) return { text: t.badName(arg) }
    // Take over a request the model made for the same name, so it hears back.
    await update($, request, pending =>
      pending !== null && pending.name === arg ? pending : { name: arg, reason: '', isFromModel: false },
    )
    await openPane($, t, arg)

    return { text: t.opened(arg) }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === OWN_TOOL) {
      const name = String(e.name ?? '')
      const reason = typeof e.reason === 'string' ? e.reason : ''
      if (!NAME.test(name)) return { deny: `Invalid name "${name}": letters, digits, _; starts with a letter.` }
      await update($, request, () => ({ name, reason, isFromModel: true }))
      const opened = await openPane($, t, name)
      const text = opened.isPlaced
        ? `The input pane for ${name} is open. End your turn now and wait for the user.`
        : `The pane could not be shown (${opened.reason}). Ask the user to run /secret ${name}, then wait.`
      return { result: text }
    }

    const isShell = e.tool === 'Bash' || e.tool === 'PowerShell'
    let input = e
    if (isShell && typeof e.command === 'string') {
      const used = [...e.command.matchAll(PLACEHOLDER)].map(match => match[1] ?? '')
      const missing = [...new Set(used.filter(name => !secrets.has(name)))]
      if (missing.length > 0) {
        return {
          deny: `No secret saved for ${missing.join(', ')}. Call ${OWN_TOOL} first, or ask the user to run /secret NAME.`,
        }
      }
      if (used.length > 0) {
        const command = e.command.replace(PLACEHOLDER, (_, name: string) =>
          quoteFor(e.tool, secrets.get(name) ?? ''),
        )
        input = { ...e, command }
      }
    }
    if (secrets.size === 0) return next(input)

    const ran = await next(input)
    if (!hasSecret(ran)) return ran
    if (ran.deny !== undefined) return { deny: redactText(ran.deny) }
    if (ran.isError) return { deny: redactText(ran.text ?? 'The command failed.') }

    return { result: redactDeep(ran.result) as typeof ran.result }
  }).catch(($, e, next) =>
    // When masking fails, withhold the result rather than pass it on.
    next.called ? { deny: 'secret-input: the result was withheld (masking failed).' } : next(e),
  )

  // Mask saved values once more in every row the model or the transcript keeps.
  on('session.append', ($, e, next) => {
    if (secrets.size === 0 || !hasSecret(e.message.content)) return next(e)
    return next({ ...e, message: { ...e.message, content: redactDeep(e.message.content) as typeof e.message.content } })
  }).catch(($, e, next) => next({ ...e, message: { ...e.message, content: [] } }))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const req = await read($, request)
    if (req !== null && e.origin.kind === 'person') {
      await update($, request, () => null)
      if (req.isFromModel) await $.prompt.submit({ text: t.cancelNote(req.name) })
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const req = await read($, request)
    const saved = await read($, names)
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{t.mobile}</Text>
    }
    const { Box, Text, Input, Button } = $.ui.resolve(e)
    if (req === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{t.idle}</Text>
          {saved.length > 0 && <Text dimColor>{t.savedList(saved.join(', '))}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>{req.name}</Text>
        {req.reason !== '' && <Text dimColor>{req.reason}</Text>}
        <Input
          key="value"
          label={t.inputLabel}
          placeholder={t.placeholder}
          submitLabel={t.submitLabel}
          autoFocus
          onSubmit={typed => void save($, t, req, typed)}
        />
        <Text dimColor>{t.warning}</Text>
        <Button key="cancel" label={t.cancel} role="dismiss" onPress={() => void cancel($, t, req)} />
      </Box>
    )
  })
}
