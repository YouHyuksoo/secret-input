export type SecretRequest = {
  name: string
  reason: string
  /** 모델이 request_secret 도구로 요청했으면 true: 저장 후 모델에게 알린다 */
  isFromModel: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'secret-input': {
      /** 저장된 비밀값의 이름만. 값은 절대 여기 두지 않는다 */
      names: Shaped<string[]>
      request: Shaped<SecretRequest | null>
    }
  }
}
