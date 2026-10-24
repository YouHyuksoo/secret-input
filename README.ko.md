# secret-input

[English](README.md)

Claude Code mod. 비밀번호·토큰·API 키를 채팅창 대신 전용 입력창으로 받습니다.
Claude(모델)는 값을 보지 못하고, Bash/PowerShell 명령이 실행되는 순간에만 실제 값이 들어갑니다.

## 설치

Claude Code 터미널 세션의 프롬프트에서:

```
/plugin install secret-input --marketplace YouHyuksoo/secret-input
```

`Add marketplace?` 에 `y`, 이어서 설치 범위(scope)를 고릅니다.

셸에서:

```
claude plugin install secret-input --marketplace YouHyuksoo/secret-input
```

데스크톱 앱(`/plugin` 이 동작하지 않는 곳): 프롬프트 옆 + → Plugins → Add marketplace 에 `YouHyuksoo/secret-input` → Add plugin.

## 사용법

1. Claude가 비밀값이 필요하면 `request_secret` 도구로 입력창을 엽니다. 직접 열려면 `/secret DB_PW`.
2. 창에 값을 붙여넣고 Enter. 값은 Claude Code 프로세스 메모리에만 저장되고, Claude에게는 "입력 끝" 알림만 갑니다.
3. Claude는 명령에 값 대신 `'{{secret:DB_PW}}'` 를 씁니다(작은따옴표 안). 실행 순간 실제 값으로 바뀝니다.
4. 실행 결과와 대화 기록에 값이 나오면 `[secret:DB_PW]` 로 가립니다.

| 명령 | 동작 |
|---|---|
| `/secret 이름` | 그 이름으로 입력창 열기 |
| `/secret` | 저장된 이름 목록(값은 안 보임) |
| `/secret --clear` | 저장된 값 모두 지우기 |

## 언어

입력창·알림·메시지는 기본이 영어입니다. 한국어로 바꾸려면 `language` 옵션을 `ko` 로 설정하세요. 설치할 때 옵션 화면에서, 또는 `/config` 메뉴에서 바꿀 수 있습니다. 바꾸면 mod 가 다시 로드되어 저장된 값이 지워집니다.

## 한계

- 이 Claude Code 버전의 입력창에는 가림(****) 기능이 없어, Enter 전까지 창에 값이 보입니다.
- 값은 디스크에 저장하지 않습니다. Claude Code 재시작이나 mod 재로드 때 사라집니다.
- 값 치환은 Bash·PowerShell 명령에만 됩니다.
- settings.json 의 PreToolUse 같은 명령 훅은 값이 들어간 명령을 받을 수 있습니다.
- 채팅에 직접 붙여넣은 값은 막지 못합니다.
- Claude가 창을 자동으로 여는 것은 터미널 폭 144칸 이상에서만 됩니다. 좁으면 `/secret 이름` 으로 직접 여세요.
