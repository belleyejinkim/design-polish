# design-polish

**코딩 에이전트로 만든 앱에는 버튼이 5종, 회색이 8종 있습니다. 한 페이지에 전부 펼쳐 보고, 남길 것을 고르면, 에이전트가 나머지를 되돌릴 수 있게 고칩니다.**

Claude Code · Codex · Cursor에서 동작 · 인벤토리는 AI 없이 · MIT

[예시 리포트 열기 →](https://belleyejinkim.github.io/design-polish/examples/messy-next/report.html) · [English](README.md)

만든 사람: [Yejin Kim](https://github.com/belleyejinkim)

---

코딩 에이전트는 생성할 때마다 문맥을 새로 시작합니다. 어제 만든 버튼이 8px 둥글었다는 걸 기억하지 못하니 그럴듯한 값을 다시 정합니다. 몇 주 쌓이면 버튼 모양 5가지, 회색 8종, 체크박스 2벌이 되는데, 코드를 열어보지 않는 사람에게는 그게 **몇 종인지 볼 방법이 없습니다.**

design-polish가 대신 코드를 읽습니다. 색·글자 크기·여백·모서리·그림자와 폼 컨트롤을 실물 크기로 한 HTML 페이지에 늘어놓고, 항목마다 사용 횟수와 등장 화면을 붙입니다. 에이전트는 무엇이 왜 어긋났는지 설명하고 정리안을 카드로 제안합니다. **고르는 건 당신**입니다. 고른 카드만 커밋 하나씩 적용하고, 다시 세어 전후를 보여줍니다.

## 동사 세 개

| | 명령 | 하는 일 | AI |
|---|---|---|---|
| **inventory** | `npx design-polish` | 스캔 → 실물 렌더 → 고르기 UI가 있는 HTML 리포트 한 장 | 불필요 |
| **polish** | 에이전트에서 `/design-polish` | inventory + 진단 + 제안 카드 + 고르기 + 적용 + 재측정 + 재발 방지 | 필요 |
| **check** | `npx design-polish check` | 기준선 이후 직접 쓴 값이나 일회성 모양이 늘면 실패(exit 1) — CI·pre-commit용 | 불필요 |

## 받는 것

1. **한 페이지, 전부 실물 크기** — 색부터 폼 컨트롤 11종(버튼·체크박스·라디오·셀렉트·드롭다운 메뉴·텍스트 필드·텍스트 영역·토글·배지·태그·칩)까지 13개 장. hover / focus / disabled / 다크 상태는 프로젝트의 컴파일된 CSS로 재현합니다.
2. **믿을 수 있는 카드** — 모든 변경에 *안 보임*(라이트·다크 모두 픽셀 동일), *거의 안 보임*(ΔE 2 또는 2px 미만), *보임*(디자인 결정) 라벨이 붙습니다. 복사해 온 `components/ui`는 세되 건드리지 않습니다.
3. **카드당 커밋 하나** — `git revert <sha>`로 하나씩, 태그로 전체를 되돌립니다.
4. **재측정** — "직접 쓴 색 6 → 1 · 발견 3건 해결, 13건 남음"을 주장이 아니라 계산으로 보여줍니다.
5. **재발 방지** — `DESIGN-TOKENS.md`, `CLAUDE.md` / `AGENTS.md`의 한 줄 포인터, CI용 `design-polish check`.

## 살아 있는 리포트 세 개

| [어지러운 앱](https://belleyejinkim.github.io/design-polish/examples/messy-next/report.html) | [깨끗한 앱](https://belleyejinkim.github.io/design-polish/examples/clean-shadcn/report.html) | [cva도 shadcn도 없는 앱](https://belleyejinkim.github.io/design-polish/examples/vite-router/report.html) |
|---|---|---|
| Next.js, 파일 28개, 버튼 모양 11가지, 옛날 체크박스, 모서리가 서로 다른 툴바, 죽은 토큰, 다크 값 누락 | 파일 12개, 정돈된 shadcn/ui. 고칠 게 없고, 리포트가 일을 만들어내는 대신 그렇다고 말합니다 | Vite + React Router, const-map 버튼. 손으로 적은 버튼 하나가 한 줄을 어긋나게 합니다 |

셋 다 `skills/design-polish/evals/fixtures`의 합성 픽스처입니다. 실제 제품 코드는 공개하지 않습니다.

## 설치

```bash
npx skills add belleyejinkim/design-polish -a claude-code -y
```

이 프로젝트의 `.claude/skills/`에 설치됩니다. 모든 프로젝트에서 쓰려면 `-g`를 붙이고, 다시 실행하면 업데이트됩니다. Codex·Cursor 등은 `-a codex`, `-a cursor` … (`-a`를 빼면 메뉴에서 고릅니다).

Claude Code 플러그인(서브에이전트 타입 3개 포함):

```
/plugin marketplace add belleyejinkim/design-polish
/plugin install design-polish@design-polish
```

CLI만 쓰려면 `npm i -g design-polish` 또는 프로젝트 안에서 `npx design-polish`.

## 에이전트에게 이렇게 말하세요

- "디자인 정리해줘" · "버튼 좀 통일해줘" · "색이랑 모서리 정리해줘" · "토큰 정리해줘"
- "Polish my design" · "Why do my buttons all look different?"
- 나중에: "C1, C3 적용해줘" · "다시 세줘(recheck)" · "리포트 열어줘"

질문은 최대 네 번, 모두 당신이 정해야 하는 것만 묻습니다(닮은 색 한 쌍, 어떤 카드를, 쓰기 전 확인). 리포트가 나오기 전에는 아무것도 묻지 않습니다.

## 지원 범위

| 스택 | 지원 |
|---|---|
| Tailwind v4 + shadcn/ui, Radix, cva, Next.js app router | 완전: 프로젝트 자신의 Tailwind로 값 컴파일, 요소 단위 귀속, 화면, 이웃 비교 |
| Next.js pages router, Vite + React Router | 완전, 화면 귀속은 약함 |
| Tailwind v3, CSS Modules | 부분: 모양과 개수는 나오지만 컴파일된 값은 없음 (1.1) |
| styled-components / emotion | 아직 — 리포트 표지에 그렇다고 표시 |
| Vue, Svelte, Angular | 범위 밖 |

Node 18+와 git이 필요합니다. 파싱에는 프로젝트의 `typescript`를 씁니다(없으면 dev dependency로 추가).

## 정직하게 만들었습니다

- 모든 숫자는 스크립트가 만듭니다. 모델은 말을 쓰고 숫자는 쓰지 않습니다. 둘이 어긋나면 검증이 실패합니다.
- 실물은 프로젝트의 컴파일된 CSS로 그립니다. 흉내 내지 않습니다.
- 해석하지 못한 것(동적 클래스 문자열, 모르는 클래스, 파싱 실패)은 추정하지 않고 목록으로 보여줍니다.
- 네트워크 요청 0, 텔레메트리 0. 리포트는 `file://`로 열립니다.
- 라이브러리 코드는 따로 셉니다. shadcn 파일 안의 직접 쓴 값을 당신 탓으로 돌리지 않습니다.

## 왜 프롬프트가 아니라 스킬인가

에이전트에게 "토큰 정리해줘"라고 하면 부분적인 `grep`, 실행마다 달라지는 숫자, 승인하지 않은 `sed`, 그리고 내가 뭘 갖고 있는지에 대한 그림 없음이 돌아옵니다. 여기서는 스크립트가 세고 쓰고, 모델이 이름 붙이고 설명하고, 사람이 고릅니다. 시간과 토큰 비용: [docs/evals.md](docs/evals.md).

## 자주 묻는 질문

**내 디자인이 바뀌나요?** *보임* 라벨이 붙은 카드를 직접 고르지 않는 한 바뀌지 않습니다.
**shadcn을 씁니다.** 그 파일들은 기본 모양으로 취급하고 건드리지 않습니다. 거기서 벗어난 당신의 코드가 정리 대상입니다.
**이미 토큰이 있어요.** 그러면 가장 안전한 카드가 먼저 나옵니다: 토큰 값을 손으로 타이핑한 자리들.
**디자이너가 고르고 개발자가 적용할 수 있나요?** 네. 리포트는 `file://`로 열리고, *파일로 저장*이 `decisions.json`을 만들며, 개발자의 에이전트가 그걸 적용합니다.
**되돌리기는?** 카드마다 `git revert <sha>`, 전체는 `git reset --hard design-polish/<run>/before`.

## 한계

Tailwind v4에서 가장 잘 동작합니다. 문자열을 이어 붙인 클래스는 추측하지 않고 "동적"으로 표시합니다. 글자·그림자·테두리는 1.0에서 인벤토리만 하고 자동 수정하지 않습니다. 컴포넌트 추출은 1.1의 opt-in 카드입니다.

[로드맵](ROADMAP.md) · [변경 이력](CHANGELOG.md) · [아키텍처](docs/architecture.md) · [기여하기](CONTRIBUTING.md)

MIT. 쓰고, 포크하고, 배포하세요.
