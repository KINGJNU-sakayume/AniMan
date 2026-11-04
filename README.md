# AniMan Timeline Tracker

애니메이션 에피소드를 원작 만화 챕터 범위에 매핑해 타임라인으로 보여 주고, 어디까지 봤는지/읽었는지 기록하는 개인용 앱입니다.

- **서버 없음.** 시리즈 데이터는 이 저장소의 JSON으로 번들되고, 진행 기록은 **이 브라우저의 localStorage**에만 저장됩니다.
- **로그인 없음.** 이 기기 = 소유자입니다. 다른 기기로 옮길 때는 JSON 백업을 내보내고 불러오거나, (선택) Life Hub 기기 동기화를 켭니다.
- GitHub Pages로 정적 배포됩니다.

> ⚠️ 공개 저장소입니다. 개인 진행 기록 백업(`animan-backup-*.json`), 토큰·키는 커밋하지 마세요. `.gitignore`가 백업 파일 이름 패턴과 `.env*`를 막아 둡니다.

---

## Architecture

```
src/
├── App.tsx                    # 화면 전환 (landing / series / admin)
├── data/series/*.json         # 번들 카탈로그 — 시리즈당 1파일 (공개 데이터)
├── components/
│   ├── SeriesLanding.tsx      # 작품 목록 + 진행률, ⚙ 설정·제안 버튼 자리
│   ├── SettingsSheet.tsx      # ⚙ 설정 시트: Life Hub · 백업 · 카탈로그 관리
│   ├── LifeHubSettings.tsx    # 설정 › Life Hub 섹션 (연결·지금 동기화·고급)
│   ├── LifeHubMenu.tsx        # Claude 제안 목록 (제안이 있을 때만)
│   ├── BackupMenu.tsx         # 백업 섹션 + 불러오기 미리보기·오래 쉰 기기 검토 대화상자
│   ├── Header.tsx             # 시리즈 화면 상단 바
│   ├── Hero.tsx               # 시리즈 히어로 + 진행 바 + BGM
│   ├── Timeline.tsx           # 에피소드 ↔ 권 타임라인 (PC + 모바일)
│   ├── TimelineNode.tsx       # 타임라인 항목 (접근성 지원)
│   ├── SocialCard.tsx         # 공유용 진행 카드
│   ├── AdminDashboard.tsx     # 로컬 편집 → 시리즈 JSON 내보내기
│   └── ErrorBoundary/
├── hooks/
│   ├── useProgress.ts         # 진행 기록 구독 (반환 형태는 기존과 동일)
│   ├── useCatalog.ts          # 카탈로그(번들 + 로컬 초안) 구독
│   ├── useTimelineData.ts     # 선택한 시리즈 → TimelineData
│   ├── useHoverMapping.ts     # 챕터 범위 겹침 하이라이트
│   └── useAccentColor.ts
├── lib/
│   ├── progress/              # ★ 진행 기록을 바꾸는 유일한 모듈 (React 비의존)
│   │   ├── model.ts           #   v2 형식(항목별 { done, at }), 정규화, 묘비 정리, 시각 찍기 (순수 함수)
│   │   ├── merge.ts           #   v2 병합(항목별 마지막 쓰기 우선) — 교환·결합·멱등 (순수 함수)
│   │   ├── store.ts           #   markCompleted / unmarkCompleted / toggleCompleted / markUpTo / importBackup / applyRemote
│   │   ├── backup.ts          #   백업 형식(v2 내보내기, v1·v2 가져오기), 검증, 불러오기 미리보기
│   │   └── index.ts           #   공개 API (window.animan.progress 로도 노출)
│   ├── catalog.ts             # 번들 JSON + 로컬 초안 병합, TimelineData 변환
│   ├── seriesBuilder.ts       # Admin 입력 ↔ 시리즈 레코드 (ID 유지)
│   ├── storage.ts             # 안전한 localStorage 래퍼
│   └── download.ts
└── types/index.ts
```

### Data Flow

```mermaid
flowchart TD
    J[(src/data/series/*.json<br/>번들 카탈로그)] --> C[lib/catalog.ts]
    D[(localStorage<br/>animan:drafts:v1)] --> C
    C --> TD[useTimelineData / useCatalog]
    TD --> UI[SeriesLanding · Hero · Timeline · SocialCard]

    UI -->|toggle / 우클릭·롱프레스 = 여기까지 완료| P[lib/progress<br/>markCompleted · markUpTo ...]
    X[화면 밖 호출<br/>window.animan.progress<br/>향후 Life Hub 승인] --> P
    B[BackupDialogs<br/>불러오기 미리보기 → 승인] -->|importBackup merge/replace| P
    S[lifehub/sync.ts · syncController.ts<br/>기기 동기화] -->|applyRemote = 로컬 ∪ 서버| P
    P <--> L[(localStorage<br/>animan:progress:v2<br/>animan:progress:v1 = 롤백용 원본)]
    P -->|subscribe| UP[useProgress] --> UI
    B -->|내보내기| F[/animan-backup-YYYY-MM-DD.json/]

    A[AdminDashboard] -->|이 기기에 초안 저장| D
    A -->|시리즈 JSON 내보내기| G[/&lt;series-id&gt;.json/]
    G -.->|직접 커밋| J
```

### Data Model

```mermaid
erDiagram
    SERIES_JSON {
        uuid id PK
        text title
        text description
        text cover_url
        text banner_url
        text accent_color
        text youtube_bgm_id
        timestamptz created_at
    }
    SEASON {
        uuid id PK
        text name
        int start_chapter
        int end_chapter "null = 연재 중"
    }
    EPISODE {
        uuid id PK "진행 항목 ID"
        text episode_number "1, 2, OVA ..."
        text title
        int start_chapter
        int end_chapter
        text cover_url
        int duration
    }
    VOLUME {
        uuid id PK "진행 항목 ID"
        int volume_number
        int start_chapter
        int end_chapter
        text cover_url
    }
    PROGRESS_LOCALSTORAGE {
        uuid seriesId "key"
        map items "에피소드/권 ID → { done, at }"
    }
    SERIES_JSON ||--o{ SEASON : seasons
    SERIES_JSON ||--o{ EPISODE : episodes
    SERIES_JSON ||--o{ VOLUME : volumes
    SERIES_JSON ||--o| PROGRESS_LOCALSTORAGE : "tracked by"
```

필드 이름은 기존 Supabase 컬럼명과 같고, **모든 id는 기존 UUID를 그대로 유지**합니다. 화면·훅이 보는 완료 목록(`{ [seriesId]: completed_ids }`)은 Supabase 시절 형식 그대로이고, 저장은 항목마다 시각을 찍은 v2(아래)에서 파생합니다.

### View Flow

```mermaid
stateDiagram-v2
    [*] --> Landing : 앱 열기 (로그인 없음)
    Landing --> Series : 작품 카드 클릭
    Series --> Landing : 로고 클릭
    Landing --> Admin : Add Series
    Landing --> Settings : ⚙ 버튼
    Series --> Settings : ⚙ 버튼
    Settings --> Admin : 카탈로그 관리
    Admin --> Landing : 뒤로
    Settings --> BackupPreview : 백업 › 불러오기 (파일 선택)
    BackupPreview --> Landing : 적용 / 취소
```

---

## 진행 기록 API (화면 밖에서도 사용)

진행 기록은 `src/lib/progress`만 바꿉니다. React 컴포넌트, 콘솔, 향후 Life Hub 연동(Claude 제안 → 앱에서 승인) 모두 같은 함수를 씁니다.

```ts
import { markCompleted, markUpTo, unmarkCompleted, toggleCompleted, importProgress, getProgress } from './lib/progress';

markCompleted(seriesId, ['<episode-or-volume-id>']); // 합집합, 새로 추가된 ID 반환
markUpTo(seriesId, 'episode', 12);                    // 원작 챕터 순서로 12화까지 완료
markUpTo(seriesId, 'volume', 3);                      // 3권까지 완료
unmarkCompleted(seriesId, ['<id>']);
importProgress({ [seriesId]: ['<id>'] }, 'merge');    // 'merge'(항목별 마지막 쓰기 우선) | 'replace'(완료 집합을 같게)
```

`getProgress()`는 화면용 완료 목록, `getProgressV2()`는 체크 해제 흔적(묘비)까지 포함한 전체 기록입니다.

브라우저 콘솔에서는 `window.animan.progress.markUpTo(...)` 로 같은 API를 호출할 수 있습니다.

### 저장 형식과 백업 형식 (v2)

```json
{ "app": "animan", "version": 2, "exportedAt": "2026-01-01T00:00:00.000Z",
  "progress": { "<seriesId>": { "<episode-or-volume-id>": { "done": true, "at": "2026-01-01T00:00:00.000Z" } } } }
```

- 저장: `localStorage` `animan:progress:v2`(위 형식 그대로). 구 `animan:progress:v1`은 v2 키가 없을 때 **한 번만** 변환하고 **지우지 않습니다**(롤백용). 변환할 때 각 id는 `done:true`, `at`은 `1970-01-01T00:00:00.000Z`(다른 기기의 실제 체크·해제가 항상 이기도록).
- `done:false`는 체크 해제 **묘비**입니다. 항목마다 `at`이 더 늦은 쪽이 이기고(같으면 `done:true`), 180일 넘은 묘비는 쓸 때만 지웁니다.
- 구형 v1 백업 파일(`"version": 1`, id 배열)도 그대로 가져올 수 있습니다(모든 id가 `done:true`, `at` = 파일의 `exportedAt`).

작품 목록 화면 오른쪽 위 **백업 내보내기 / 불러오기**. 불러오기는 미리보기(작품별 현재 → 적용 후, 추가/제거 수, 카탈로그에 없는 ID 경고)를 보여 주고, **합치기(기본, 항목별 마지막 쓰기 우선)** 또는 덮어쓰기(사라지는 항목은 묘비가 됨)를 고른 뒤 **적용**해야 반영됩니다. 이 수동 내보내기/가져오기는 Life Hub 없이도 되는 비상용 경로입니다.

---

## Life Hub로 진행 제안 받기 (선택)

Claude에게 "주술회전 2기 5화까지 봤어", "최애의 아이 만화 7권까지 읽었어"처럼 말하면 Claude가 [Life Hub](https://github.com/KINGJNU-sakayume/life-hub)에 **진행 제안**(`media_progress`)을 남기고, AniMan이 받아 온다.

- 헤더 톱니(**설정**) › **Life Hub** 섹션에서 한 번 연결한다(배포 주소에서만). 연결·해제·「지금 동기화」 버튼은 이 섹션에만 있다. OAuth 공개 클라이언트(`public/lifehub-client.json`, PKCE), `animan:inbox animan:sync`를 요청한다. 동기화 권한을 실제로 주는지는 동의 화면의 「기기끼리 동기화도 허용」 체크가 정한다(체크하지 않아도 제안 가져오기는 그대로 된다). Life Hub는 `public/lifehub/`로 돌아온다.
- 제안이 1건 이상일 때만 첫 화면에 **Life Hub** 버튼(숫자 배지)이 나타나고, 누르면 제안 목록이 열린다. 0건이면 버튼이 없다. 작품 제목(또는 괄호 안 원제)이 하나로 맞을 때만 자동 선택, 애매하면 고른다. 카탈로그에 없는 작품은 추가한 뒤 다시 확인.
- "N화/권까지"는 타임라인 순서로 그 앞까지 모두, 번호 목록은 그것만. "2기 5화"는 시즌의 챕터 범위로 바꿔 계산한다(`src/lifehub/resolve.ts`). 기록 전에 새로 완료될 개수를 보여 준다.
- 「기록」은 `markCompleted`(지우지 않음), 「거절」은 변경 없음. 승인(시리즈 ID)·거절 결과는 동기화 때 Life Hub로 보내고 응답이 올 때까지 다시 보낸다(localStorage `animan.lifehub.*`).
- **Claude 대화 카드**에서 승인한 진행은, 작품이 하나로 정해지고 요청한 번호가 모두 있을 때 앱을 열면 바로 완료로 표시한다(설정 › Life Hub 「Claude에서 승인한 기록은 바로 반영」, 기본 켜짐). 아니면 위 목록에서 「Claude 카드에서 승인함」으로 기다린다.
- 카드의 작품 이름 제안을 위해 카탈로그의 **작품 id·제목·강조 색**만 Life Hub에 공유한다(바뀔 때만). 진행 기록은 보내지 않는다.

## Life Hub로 기기끼리 동기화 (선택)

Life Hub의 `/animan/v1/sync`에 진행 기록 v2 문서를 한 개 보관해 여러 기기의 기록을 맞춥니다([life-hub `docs/P6_SYNC.md`](https://github.com/KINGJNU-sakayume/life-hub/blob/main/docs/P6_SYNC.md)가 계약). 코드는 `src/lifehub/sync.ts`(한 번의 동기화), `syncController.ts`(언제 할지), 화면은 설정 › Life Hub 섹션(상태 줄, 「지금 동기화」, 접힌 「고급」의 기기 이름).

- **켜기:** 따로 없다. Life Hub에 연결되어 있으면 동기화는 켜진 것으로 동작한다(예전 저장값이 꺼짐이어도 앱 시작 시 켜짐으로 바꾼다). 토큰에 동기화 권한이 없으면 설정 톱니에 점이 생기고 「확인 필요 — 동기화 권한이 없는 연결」과 「다시 연결」이 보인다(제안 가져오기는 그대로 된다).
- **언제:** 앱 시작·탭이 다시 보일 때 가져오고(폴링 없음), 변경 5초 뒤·탭이 숨겨질 때 올린다. 한 번에 하나만 돈다.
- **어떻게:** `GET /sync/meta` → 서버 version이 다르거나 올릴 변경이 있으면 `GET /sync` → 로컬 ∪ 서버로 병합 → 다르면 `PUT`(`If-Match: "<version>"`, 최초는 `If-None-Match: *`). `412`면 다시 읽고 병합해 최대 3번. 로컬에는 언제나 병합 결과만 쓰고, 실패해도 로컬 기록은 그대로다.
- **멈춤:** `413`(너무 큼)·`400/415/428`(오류)는 자동 동기화를 멈추고 알린다. 180일 넘게 동기화하지 않은 기기는 자동 병합하지 않고, 「서버 문서 검토」를 거쳐야만 풀린다: 다른 기기에서 이미 지워진 것으로 보이는 항목(마지막 동기화 시각 F 이하이고 서버에 없는 로컬 항목)을 목록으로 보여 주고, 현재 로컬 진행도 내려받기를 권한 뒤, 확인하면 그 항목을 묘비 없이 지우고 나머지를 병합해 동기화한다. 취소하면 아무것도 바뀌지 않는다.
- **끄기·롤백:** 「연결 해제」를 하면 제안과 동기화가 모두 멈추고 이 기기는 Life Hub와 주고받지 않는다(이 기기의 기록은 지우지 않는다). `animan:progress:v1`은 남아 있고(옛 빌드로 되돌릴 수 있음), 수동 JSON 내보내기/가져오기는 그대로 쓸 수 있다.

## 콘텐츠 추가 / 수정

1. 앱에서 **Add Series**(또는 ⚙ 설정 › 카탈로그 관리) → Admin Dashboard.
2. 새 작품이면 그대로, 기존 작품이면 **편집 대상**에서 선택 (JSON에 기존 id가 들어 있어 저장해도 ID가 유지됩니다).
3. **이 기기에 초안 저장** → 앱에서 바로 확인 (카드에 `로컬 초안` / `로컬 수정` 배지).
4. **시리즈 JSON 내보내기** → 받은 `<series-id>.json`을 `src/data/series/`에 넣고 커밋·푸시.
5. 배포 후 Admin의 초안 목록에서 해당 초안을 삭제 (같은 id의 초안은 번들보다 우선하므로).

Episodes/Volumes JSON 입력 예:

```json
{
  "seasons":  [{ "name": "1기", "startChapter": 1, "endChapter": 40 }],
  "episodes": [{ "number": 1, "title": "...", "startChapter": 1, "endChapter": 3, "duration": 24 }],
  "volumes":  [{ "number": 1, "startChapter": 1, "endChapter": 9 }]
}
```

---

## Setup

Node.js 20 권장. 환경변수는 필요 없습니다.

```bash
npm install
```

```bash
npm run dev
```

| Script | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (`http://localhost:5173/animan/`) |
| `npm run build` / `npm run preview` | 프로덕션 빌드 / 미리보기 |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | 단위 테스트 (Vitest — 진행 저장소, 백업, Admin 빌더) |
| `npm run test:e2e` | Playwright E2E (dev 서버 자동 실행) |

### 테스트

- 단위/E2E 테스트는 **합성 데이터만** 사용합니다. E2E는 합성 시리즈를 로컬 초안으로 주입해 실행하므로 카탈로그가 비어 있어도 동작합니다.
- 처음 E2E를 돌릴 때 브라우저 설치: `npx playwright install chromium`. 이미 설치된 Chromium을 쓰려면 `PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

### CI / 배포

- `.github/workflows/ci.yml`: PR과 main push마다 lint → typecheck → unit → build → e2e(Chromium).
- `.github/workflows/deploy.yml`: main push 시 GitHub Pages 배포 (시크릿 불필요). 배포 주소: https://kingjnu-sakayume.github.io/animan/

---

## Key Design Decisions

- **로컬 우선**: 혼자 쓰는 앱이라 인증·승인·RLS를 없애고, 진행 기록은 브라우저에 둡니다. 기기 간 이동/보관은 JSON 백업으로 합니다.
- **카탈로그 = 코드**: 공개 데이터인 시리즈 정보는 PR로 리뷰·이력 관리됩니다. 시리즈당 1파일이라 diff가 작습니다.
- **ID 안정성**: 진행 항목 ID는 에피소드/권 UUID입니다. 내보내기 스크립트와 Admin 편집 모두 기존 ID를 유지하며, 새 항목만 `crypto.randomUUID()`로 만듭니다.
- **단일 쓰기 경로**: 진행 기록 변경은 `lib/progress`의 함수로만 일어나므로, 이후 외부 제안(Life Hub) 승인 흐름을 같은 함수 위에 붙일 수 있습니다.
- **챕터 범위 매핑**: 별도 매핑 테이블 없이 `start_chapter` / `end_chapter`로 겹침을 메모리에서 계산합니다.

---

카탈로그는 2026년에 Supabase에서 src/data/series/로 옮겼고, 이전 도구는 커밋 e7c0221에 남아 있습니다.
