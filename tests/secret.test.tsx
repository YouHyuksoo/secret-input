import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'secret-input',
  component: 'Pane',
  requestId: 'secret-input',
  props: {
    title: 'Secret: DB_PW',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 7 },
    view: {},
  },
} as const

const DUMMY = "zz-dummy-91'827"

test('a saved value goes into the command only and is masked in the result', async ($, on) => {
  const ran: string[] = []
  on('command.register', () => ({ value: { command: 'secret' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__secret-input__request_secret' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    const command = 'command' in e ? String(e.command) : ''
    ran.push(command)
    return { result: { stdout: `got ${command}`, stderr: '', interrupted: false } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'secret',
    args: 'DB_PW',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /DB_PW/ })).toBeDefined()
    if (surface === 'terminal') await ui.input({ key: 'value', text: DUMMY })
    await ui.unmount()
  }

  const result = await $.tool.call({ tool: 'Bash', command: "echo '{{secret:DB_PW}}'" })
  expect(ran.at(-1)).toBe(`echo 'zz-dummy-91'\\''827'`)
  expect(JSON.stringify(result)).not.toContain('zz-dummy')
  expect(JSON.stringify(result)).toContain('[secret:DB_PW]')

  const ps = await $.tool.call({ tool: 'PowerShell', command: "Write-Output '{{secret:DB_PW}}'" })
  expect(ran.at(-1)).toBe("Write-Output 'zz-dummy-91''827'")
  expect(JSON.stringify(ps)).not.toContain('zz-dummy')
})

test('a name with no saved value is not run', async ($, on) => {
  let calls = 0
  on('tool.call', () => {
    calls += 1
    return { result: {} }
  })

  const result = await $.tool.call({ tool: 'Bash', command: "echo '{{secret:NOPE}}'" })
  expect(result.deny).toContain('NOPE')
  expect(calls).toBe(0)
})

for (const [language, words] of [
  ['en', /Not sent to the chat/],
  ['ko', /채팅·모델에는/],
] as const) {
  test(`the pane speaks ${language}`, { options: { language } }, async ($, on) => {
    on('command.register', () => ({ value: { command: 'secret' } }))
    on('tool.register', () => ({ value: { tool: 'mcp__secret-input__request_secret' } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.command.run({
      command: 'secret',
      args: 'DB_PW',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 160 },
    })
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: words })).toBeDefined()
    await ui.unmount()
  })
}
