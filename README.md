# secret-input

[한국어](README.ko.md)

A Claude Code mod. It takes passwords, tokens and API keys in a private input pane instead of the chat.
Claude (the model) never sees the value: it is put into a Bash or PowerShell command only when that command runs.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install secret-input --marketplace YouHyuksoo/secret-input
```

Answer `y` to `Add marketplace?`, then pick a scope.

From a shell:

```
claude plugin install secret-input --marketplace YouHyuksoo/secret-input
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `YouHyuksoo/secret-input`, then Add plugin.

## How it works

1. When Claude needs a secret, it opens the input pane with its `request_secret` tool. To open it yourself, run `/secret DB_PW`.
2. Paste the value into the pane and press Enter. The value is kept in the Claude Code process's memory only; Claude is told just that it was entered.
3. Claude writes `'{{secret:DB_PW}}'` (inside single quotes) in place of the value. The real value goes in when the command runs.
4. Wherever the value shows up in a command's output or in the transcript, it is replaced with `[secret:DB_PW]`.

| Command | What it does |
|---|---|
| `/secret NAME` | Open the input pane for NAME |
| `/secret` | List the saved names (never the values) |
| `/secret --clear` | Remove every saved value |

## Language

The pane, toasts and messages are in English by default. To switch to Korean, set the `language` option to `ko`: on the options screen at install, or in the `/config` menu. Changing it reloads the mod, which clears the saved values.

## Limits

- The input field in this Claude Code version cannot mask what you type (no `****`): the value is visible in the pane until you press Enter.
- Values are never written to disk, so restarting Claude Code or reloading the mod clears them.
- The value is put only into Bash and PowerShell commands.
- Command hooks in your `settings.json` (PreToolUse and the like) may receive the command with the value in it.
- A value you paste straight into the chat is not protected.
- Claude can open the pane by itself only in a terminal at least 144 columns wide. Narrower, run `/secret NAME` yourself.
