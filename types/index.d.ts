export type SecretRequest = {
  name: string
  reason: string
  /** True when the model asked through request_secret: it hears back once saved */
  isFromModel: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'secret-input': {
      /** The names of the saved secrets only; a value is never kept here */
      names: Shaped<string[]>
      request: Shaped<SecretRequest | null>
    }
  }
}
