import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'secret-input',
  component: 'Pane',
  requestId: 'secret-input',
  props: {
    title: '비밀값 입력: DB_PW',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 7 },
    view: {},
  },
} as const

const DUMMY = "zz-dummy-91'827"

test('저장한 값은 명령에만 들어가고 결과·기록에서는 가려진다', async ($, on) => {
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

test('저장 안 된 이름은 실행하지 않는다', async ($, on) => {
  let calls = 0
  on('tool.call', () => {
    calls += 1
    return { result: {} }
  })

  const result = await $.tool.call({ tool: 'Bash', command: "echo '{{secret:NOPE}}'" })
  expect(result.deny).toContain('NOPE')
  expect(calls).toBe(0)
})
