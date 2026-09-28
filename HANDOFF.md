# HANDOFF — 이어서 작업할 세션을 위한 메모

> 이전 세션에서 셸이 막혀 GitHub API 로 직접 올린 **미검증(WIP) 코드**입니다.
> typecheck / lint / build / e2e 를 한 번도 돌리지 못했습니다. 이 파일은 작업이 끝나면 삭제하세요.

## 원래 요청
코드 구조 평가·수정, UI/UX 평가·수정(디자인은 자잘하게만, 큰 틀 변경은 subpage 로 보여주기),
모바일·PC 모두 불편함 없고 미학적이어야 함. main 에 merge 하기 전 PR 을 GitHub Actions 로 배포(미리보기).

## 확인된 버그 (목 백엔드로 재현함)
1. 떠 있는 로그아웃 버튼이 "Add Series"·설정 버튼을 덮어 클릭 불가 (PC/모바일).
2. 모바일: 카드 위에서 시작한 느린 스크롤이 롱프레스로 인식 → Ep1~20 일괄 완료, 되돌리기 없음.
3. PC: 짧은 드래그 스크롤 후 놓으면 항목이 토글됨.
4. 모바일에서 공유·BGM 버튼 없음, 트래커가 접힌 채 시작.
5. YouTube iframe 이 두 번 로드, 진도 저장 레이스, 죽은 코드, e2e 가 삭제된 UI 기준.

## 이번에 바뀐 것 (커밋됨)
- 구조: `src/pages/`, `src/components/timeline/`, `src/lib/{api,auth,progress,timelineLayout,color}.ts`,
  해시 라우팅(`useHashRoute`), 직렬화된 진도 저장(`useProgress`), lazy BGM(`useYouTubeBgm`).
- UI/UX: 공용 `AppHeader`, 모바일 액션 버튼, 롱프레스/드래그 수정 + 실행취소 토스트,
  반응형 공유 카드, iOS 입력 확대 방지, `lang=ko`, keep-all, 파비콘.
- 테스트: `e2e/support/mockSupabase.ts` (Playwright 라우트로 만든 가짜 Supabase), 새 e2e 스펙.
- CI: `.github/workflows/ci.yml`, PR 미리보기 배포 `.github/workflows/deploy.yml`.

## 남은 작업 (순서대로)
1. `npm ci && npm run typecheck && npm run lint && npm run build` → 오류 수정.
   - 삭제됐어야 할 옛 파일이 남아 있으면 지울 것: `src/components/{Timeline,TimelineNode,SeriesLanding,Header,SearchBar}.tsx`,
     `src/hooks/useAccentColor.ts`, `src/lib/mockData.ts`.
2. e2e: 이 컨테이너는 Playwright 가 기대하는 Chromium 리비전이 없으므로
   `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` 로 실행.
3. 목 백엔드로 데스크탑(1440)·모바일(390/360) 스크린샷을 찍어 시각 확인.
4. 커밋 → `claude/pensive-brown-xfnz9o` push → PR 생성 → CI·미리보기 배포 확인.
5. 이 HANDOFF.md 삭제.

## 저장소 소유자가 해야 할 설정 (한 번만)
PR 에서 실행된 배포는 `refs/pull/N/merge` 로 간주되어 `github-pages` 환경 규칙에 막힘니다.
**Settings → Environments → github-pages → Deployment branches and tags** 에서
`refs/pull/*/merge` 규칙을 추가하거나 "No restriction" 을 선택.
