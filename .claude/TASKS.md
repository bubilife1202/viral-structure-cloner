# Task Board

> PM(총괄)이 관리하는 메인 태스크 보드
> "TASKS.md 읽고 진행해" 명령으로 자동 워크플로우 시작

---

## Current Sprint

### In Progress
<!-- 현재 진행 중인 태스크 -->

### Todo
<!-- 대기 중인 태스크 -->
- [ ] 바로 시작 페이지 모바일 반응형 검수 `@qa` `@design`
- [ ] 스크립트 생성 속도 개선 `@dev`

### Blocked
<!-- 블로커가 있는 태스크 -->

---

## Backlog
<!-- 우선순위 낮은 태스크 -->
- [ ] 카테고리 탐색 기능 구현 `@dev` `@design`
- [ ] 다크모드 색상 미세 조정 `@design`

---

## Done (Recent)
<!-- 최근 완료된 태스크 -->
- [x] 템플릿 워크스페이스 페이지 분리 `@dev` `2024-12-26`
- [x] git 폴더 통합 정리 `@devops` `2024-12-26`
- [x] Whisper 한국어 모델 업그레이드 `@dev` `2024-12-26`

---

## How to Use

1. 태스크 등록: `- [ ] 설명 @담당자 우선순위`
2. 담당자 태그: `@design` `@dev` `@qa` `@devops` `@content`
3. 우선순위: `P0`(긴급) `P1`(높음) `P2`(보통)
4. PM에게 "TASKS.md 진행해" 명령

---

## Agent Communication

> 에이전트 간 논의가 필요하면 여기에 기록

### Active Discussions
<!-- 진행 중인 논의 -->

### Decisions Made
<!-- 결정된 사항 -->
- 폴더 통합: dev/prod 분리 대신 단일 폴더 + git 관리 `2024-12-26`
