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

// 값은 모듈 메모리에만 둔다. $.state 는 다른 플러그인도 읽을 수 있고,
// $.store 는 디스크에 평문으로 남는다. 그래서 mod 재로드·재시작 때 값은 사라진다.
const secrets = new Map<string, string>()

const TOOL_DESCRIPTION = [
  'Ask the user for a secret (password, token, API key) through a private input pane,',
  'so the value never enters the chat. Use this instead of asking the user to paste a secret in chat.',
  'It returns at once: end your turn and wait; a message arrives when the user has saved it.',
  "Then write '{{secret:NAME}}' in a Bash or PowerShell command, always inside single quotes;",
  'the value is put in when the command runs and masked as [secret:NAME] in the output.',
  'You never see the value: do not try to print, save or read it back.',
].join(' ')

// 모델은 placeholder 를 작은따옴표 안에 쓴다. 그 안에서 깨지지 않게 셸별로 이스케이프한다.
const quoteFor = (tool: string, value: string) =>
  tool === 'PowerShell'
    ? value.replace(/['‘’‚‛]/g, quote => quote + quote)
    : value.replace(/'/g, `'\\''`)

// 원래 값과, 명령에 넣을 때 이스케이프된 모양을 모두 가린다(오류 메시지가 명령을 되풀이할 수 있다).
// 긴 것부터 가린다: 한 값이 다른 값의 일부일 때도 긴 쪽이 이긴다.
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

const openPane = ($: EngineInterface, name: string) =>
  $.ui.open({ id: PANE, title: `비밀값 입력: ${name}`, focus: true, closeOnEscape: true, rows: 7 })

const finish = async ($: EngineInterface, req: SecretRequest, note: string) => {
  await update($, request, () => null)
  await $.ui.close({ id: PANE })
  if (req.isFromModel) await $.prompt.submit({ text: note })
}

const save = async ($: EngineInterface, req: SecretRequest, typed: string) => {
  const value = typed.replace(/[\r\n]+$/, '')
  if (value === '') {
    $.ui.toast('빈 값은 저장하지 않아요.')
    return
  }
  secrets.set(req.name, value)
  await update($, names, list => [...new Set([...list, req.name])])
  $.ui.toast(`${req.name} 저장됨 (${value.length}자)`)
  await finish(
    $,
    req,
    `[secret-input] ${req.name} 입력이 끝났습니다. 명령에 '{{secret:${req.name}}}' 로 쓰세요. 값은 보이지 않습니다.`,
  )
}

const cancel = ($: EngineInterface, req: SecretRequest) =>
  finish($, req, `[secret-input] 사용자가 ${req.name} 입력을 취소했습니다.`)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // 재로드되면 메모리의 값이 비므로 이름 목록도 비운다.
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
      description: '비밀값을 채팅 대신 전용 입력창으로 넣기 (/secret 이름, /secret 목록, /secret --clear)',
      argumentHint: '[이름|--clear]',
    })

    return next(e)
  })

  on('command.run', { command: 'secret' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') {
      const list = [...secrets.keys()]
      return {
        text: list.length === 0 ? '저장된 비밀값이 없어요. /secret 이름 으로 넣으세요.' : `저장됨: ${list.join(', ')}`,
      }
    }
    if (arg === '--clear') {
      secrets.clear()
      await update($, names, () => [])
      return { text: '저장된 비밀값을 모두 지웠어요.' }
    }
    if (!NAME.test(arg)) return { text: `이름은 영문으로 시작하고 영문·숫자·_ 만 써요: ${arg}` }
    // 모델이 같은 이름을 먼저 요청해 두었으면 그 요청을 이어받아, 저장 후 모델에게 알린다.
    await update($, request, pending =>
      pending !== null && pending.name === arg ? pending : { name: arg, reason: '', isFromModel: false },
    )
    await openPane($, arg)

    return { text: `${arg} 입력창을 열었어요. 값은 채팅에 남지 않아요.` }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === OWN_TOOL) {
      const name = String(e.name ?? '')
      const reason = typeof e.reason === 'string' ? e.reason : ''
      if (!NAME.test(name)) return { deny: `Invalid name "${name}": letters, digits, _; starts with a letter.` }
      await update($, request, () => ({ name, reason, isFromModel: true }))
      const opened = await openPane($, name)
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
    // 가리다 실패하면 결과를 내보내지 않는다.
    next.called ? { deny: 'secret-input: the result was withheld (masking failed).' } : next(e),
  )

  // 모델·기록으로 가는 모든 행에서 저장된 값을 한 번 더 가린다.
  on('session.append', ($, e, next) => {
    if (secrets.size === 0 || !hasSecret(e.message.content)) return next(e)
    return next({ ...e, message: { ...e.message, content: redactDeep(e.message.content) as typeof e.message.content } })
  }).catch(($, e, next) => next({ ...e, message: { ...e.message, content: [] } }))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const req = await read($, request)
    if (req !== null && e.origin.kind === 'person') {
      await update($, request, () => null)
      if (req.isFromModel) await $.prompt.submit({ text: `[secret-input] 사용자가 ${req.name} 입력을 취소했습니다.` })
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const req = await read($, request)
    const saved = await read($, names)
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>이 화면에는 입력창이 없어요. 터미널에서 /secret 이름 으로 넣으세요.</Text>
    }
    const { Box, Text, Input, Button } = $.ui.resolve(e)
    if (req === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>요청된 비밀값이 없어요. /secret 이름 으로 여세요.</Text>
          {saved.length > 0 && <Text dimColor>저장됨: {saved.join(', ')}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>{req.name}</Text>
        {req.reason !== '' && <Text dimColor>{req.reason}</Text>}
        <Input
          key="value"
          label="값 "
          placeholder="여기에 붙여넣고 Enter"
          submitLabel="저장"
          autoFocus
          onSubmit={typed => void save($, req, typed)}
        />
        <Text dimColor>채팅·모델에는 보내지 않아요. Enter 전까지 이 창에는 보여요.</Text>
        <Button key="cancel" label="취소" role="dismiss" onPress={() => void cancel($, req)} />
      </Box>
    )
  })
}
