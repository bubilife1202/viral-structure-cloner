# Task Board

> PM(총괄)이 관리하는 메인 태스크 보드
> "TASKS.md 읽고 진행해" 명령으로 자동 워크플로우 시작

---

## Current Sprint: 랜딩 UX 개선 + 인기영상 탐색 기능

### 완료 기준 (Definition of Done)
- [x] 첫 화면 문구 → "잘 되는 영상 구조로 내 스크립트 만들기" 노출
- [x] 카드1 클릭 → URL 입력 → 분석 → 스크립트 생성 완료
- [x] 카드2 클릭 → 카테고리(10개) → 템플릿 → 스크립트 생성 완료
- [x] 카드3 클릭 → 카테고리(10개) → 영상목록(10개) → 분석 화면 이동
- [x] 모바일(768px 이하) 정상 동작
- [x] 다크모드 정상 동작

**✅ 스프린트 완료 (2025-12-26)**

---

## 스프린트 상세 스펙

### 1. 카테고리 통일 (31개 → 10개)
```javascript
const CATEGORIES = [
  { id: "health", icon: "🏃", name: "건강/운동", query: "건강 쇼츠" },
  { id: "finance", icon: "💰", name: "재테크/투자", query: "재테크 쇼츠" },
  { id: "food", icon: "🍳", name: "요리/맛집", query: "요리 레시피 쇼츠" },
  { id: "tech", icon: "💻", name: "IT/테크", query: "IT 쇼츠" },
  { id: "selfdev", icon: "📚", name: "자기계발", query: "자기계발 쇼츠" },
  { id: "beauty", icon: "💄", name: "뷰티/화장품", query: "뷰티 쇼츠" },
  { id: "travel", icon: "✈️", name: "여행", query: "여행 쇼츠" },
  { id: "game", icon: "🎮", name: "게임", query: "게임 쇼츠" },
  { id: "pet", icon: "🐶", name: "반려동물", query: "반려동물 쇼츠" },
  { id: "humor", icon: "😂", name: "유머/예능", query: "유머 쇼츠" }
];
```
- 바로시작(카드2) + 인기영상(카드3) 둘 다 동일 카테고리 사용

### 2. 인기 영상 탐색 플로우
```
카드3 클릭 → exploreWorkspace 표시
    ↓
Step1: 카테고리 그리드 (10개)
    ↓ 카테고리 클릭
Step2: 영상 목록 그리드 (10개)
    - 썸네일 (자동생성: img.youtube.com/vi/{ID}/hqdefault.jpg)
    - 제목
    - 채널명
    - 조회수
    - [이 영상 분석하기] 버튼
    ↓ 버튼 클릭
mainWorkspace로 이동 + URL 자동 입력
```

### 3. YouTube API 배치 스크립트
- **파일**: `scripts/update_videos.py`
- **실행**: 하루 1회 (수동 또는 cron)
- **로직**:
  ```python
  for category in CATEGORIES:
      results = youtube.search(
          q=category.query,
          type="video",
          videoDuration="short",
          publishedAfter=(now - 7일),  # 최근 7일
          order="viewCount",
          maxResults=10
      )
      # 결과 없으면 대체 검색어로 재시도
      # 그래도 없으면 해당 카테고리 제외
  ```
- **저장**: `data/popular_videos.json`
- **API 사용량**: 10회 × 100 units = 1,000 units/일 (한도 10,000)

### 4. 빈 카테고리 처리
1. API 결과 0개 → 대체 검색어로 재시도 (ex: "건강 유튜브")
2. 재시도도 0개 → 해당 카테고리 UI에서 숨김
3. 전체 0개 → 에러 메시지 표시

### 5. 파일별 수정 사항
| 파일 | 작업 |
|------|------|
| `static/index.html` | exploreWorkspace 섹션 추가 |
| `static/style.css` | 영상 카드 스타일 (.video-card, .video-grid) |
| `static/script.js` | CATEGORIES 10개로 변경, 탐색 로직 추가 |
| `application.py` | GET /api/popular-videos 엔드포인트 추가 |
| `services/youtube.py` | fetch_popular_videos() 함수 추가 |
| `scripts/update_videos.py` | 배치 스크립트 신규 생성 |
| `data/popular_videos.json` | 영상 데이터 저장 |

### 6. Whisper 대기 UX 확인
- **상황**: 자막 없는 영상 → Whisper 음성인식 (30초~2분 소요)
- **현재 로딩 메시지** (script.js loadingMessages):
  ```
  0초: "영상 분석 중..."
  3초: "자막 추출 중..."
  6초: "패턴 분석 중..."
  10초: "거의 다 됐어요!" + 팁 표시
  20초: "조금만 더요..."
  35초: "열심히 분석 중... 복잡한 영상이네요"
  ```
- **확인 필요**:
  - [ ] Whisper 전환 시 "음성 인식 중..." 메시지 추가 필요?
  - [ ] 예상 소요 시간 표시 필요?
  - [ ] 취소 버튼 필요?

---

### In Progress
- [ ] **인기영상 탐색 v2 개선** `@pm` `P0`

### Todo
<!-- 대기 중인 태스크 -->
- [ ] **에이전트 리뷰 워크플로우 자동화**: 사용자 요청 시 모든 에이전트(@dev → @design → @qa → @critic) 순차 검토 필수화 `@pm` `P1`

---

## 인기영상 탐색 v2 스펙

### 0. 데이터 갱신 주기 `@devops`
```
현재: 수동 실행
개선:
- 매일 오전 6시 자동 실행 (cron 또는 GitHub Actions)
- 데이터 갱신 시간 UI에 표시: "12시간 전 업데이트"
- 영상은 7일 이내 업로드된 것만 수집
```

### 1. 바이럴 지표 추가 `@dev`
```
현재: 조회수만 표시
개선:
- 구독자 수 수집 (YouTube API channels.list)
- 바이럴 지수 = 조회수 / 구독자수
- 바이럴 지수 높은 순으로 정렬
- 업로드 날짜 추가

⚠️ 필터 조건:
- 최소 구독자: 1,000명 이상 (너무 작은 채널 제외)
- 최대 구독자: 100만명 이하 (대형 채널 제외 - 이미 유명)
- 최소 조회수: 10,000 이상 (노출 안 된 영상 제외)
- 바이럴 지수: 최소 2배 이상 (구독자보다 조회수 2배)
```

**API 변경:**
```python
# scripts/update_videos.py 수정
details[video_id] = {
    "id": video_id,
    "title": ...,
    "channel": ...,
    "channel_id": ...,       # 추가
    "subscribers": "1.2만",  # 추가 (채널 구독자)
    "views": "50만",
    "viral_ratio": 41.6,     # 추가 (조회수/구독자)
    "uploaded_at": "3일 전", # 추가
    "duration": ...,
    "url": ...
}
```

### 2. UI 카드 리디자인 `@design`
```
┌─────────────────────────────┐
│ [썸네일]           🔥 50배  │  ← 바이럴 뱃지
│                     0:45   │
├─────────────────────────────┤
│ 제목 (2줄까지)              │
│ 채널명 · 구독자 1.2만        │  ← 구독자 추가
│ 조회수 50만 · 3일 전         │  ← 날짜 추가
│ [🎯 이 구조 분석하기]        │
└─────────────────────────────┘
```

### 3. 모바일 최적화 `@design`
- [ ] 768px 이하: 1열 레이아웃 (카드 더 크게)
- [ ] 바이럴 뱃지: 썸네일 우상단 오버레이
- [ ] 터치 영역: 카드 전체 터치 가능
- [ ] 필터 버튼: 상단 고정 (바이럴순/최신순)

### 4. 정렬/필터 기능 `@dev`
- [ ] 기본: 바이럴 지수 순
- [ ] 옵션: 조회수 순, 최신순
- [ ] UI: 탭 또는 드롭다운

### 5. 사용자 액션 개선 `@dev` `@design`
- [ ] "이 구조 분석하기" → 더 눈에 띄는 CTA
- [ ] 영상 클릭 시 미리보기 모달? (검토 필요)
- [ ] 분석 전 예상 시간 표시

### 작업 순서
1. `@dev`: scripts/update_videos.py에 구독자, 바이럴 지수 추가
2. `@dev`: API 응답에 새 필드 포함
3. `@design`: 카드 UI 리디자인 (HTML/CSS)
4. `@dev`: JS에서 새 필드 렌더링
5. `@design`: 모바일 반응형 최적화
6. `@dev`: 필터/정렬 기능 추가
7. `@qa`: 전체 테스트
8. `@critic`: 최종 검증

### Blocked
<!-- 블로커가 있는 태스크 -->

---

## Backlog
<!-- 우선순위 낮은 태스크 -->
- [ ] 스크립트 생성 속도 개선 `@dev`

---

## Done (Recent)
<!-- 최근 완료된 태스크 -->
- [x] CATEGORIES 31개 → 10개로 통일 `@dev` `2025-12-26`
- [x] 인기 영상 탐색 UI (HTML) - exploreWorkspace 섹션 `@design` `2025-12-26`
- [x] 인기 영상 탐색 CSS - 영상 카드, 그리드 스타일 `@design` `2025-12-26`
- [x] 인기 영상 탐색 JS - 카테고리 선택, 영상 목록, 분석 연결 `@dev` `2025-12-26`
- [x] YouTube API 배치 스크립트 작성 (scripts/update_videos.py) `@dev` `2025-12-26`
- [x] /api/popular-videos 엔드포인트 추가 `@dev` `2025-12-26`
- [x] Whisper 대기 UX 개선 - 음성인식 메시지 90초까지 확장 `@dev` `2025-12-26`
- [x] 전체 플로우 QA 검수 + 버그 수정 `@qa` `@critic` `2025-12-26`
- [x] 모바일 반응형 검수 + 터치 영역 수정 `@qa` `@design` `2025-12-26`
- [x] 다크모드 검수 + 대비율/변수 수정 `@qa` `2025-12-26`
- [x] Critic 에이전트 추가 `@pm` `2025-12-26`
- [x] 템플릿 워크스페이스 페이지 분리 `@dev` `2025-12-26`
- [x] git 폴더 통합 정리 `@devops` `2025-12-26`
- [x] Whisper 한국어 모델 업그레이드 `@dev` `2025-12-26`

---

## How to Use

1. 태스크 등록: `- [ ] 설명 @담당자 우선순위`
2. 담당자 태그: `@design` `@dev` `@qa` `@devops` `@content` `@critic`
3. 우선순위: `P0`(긴급) `P1`(높음) `P2`(보통)
4. PM에게 "TASKS.md 진행해" 명령

### Critic 리뷰 워크플로우
```
태스크 완료 → @critic 리뷰 요청
    ↓
🔴 심각한 문제 → 태스크 다시 In Progress로 (수정 필수)
🟡 개선 필요 → 수정 후 재검토
✅ 통과 → Done으로 이동
```
**규칙**: Critic 통과 없이는 Done 처리 금지

---

## Agent Communication

> 에이전트 간 논의가 필요하면 여기에 기록

### Active Discussions
<!-- 진행 중인 논의 -->

### Decisions Made
<!-- 결정된 사항 -->
- 폴더 통합: dev/prod 분리 대신 단일 폴더 + git 관리 `2025-12-26`
