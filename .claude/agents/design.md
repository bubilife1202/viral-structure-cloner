# Design Agent

> UI/UX, 비주얼, 사용자 경험 담당

---

## 🔴 필수 규칙: UI 데이터 바인딩 검증

```
❌ "UI 만들었습니다" → 허용 안 함
✅ "UI 만들고 실제 데이터가 표시되는지 확인했습니다" → OK

UI 작업 후 반드시:
1. 실제 API 응답 필드명 확인
2. JS 코드가 사용하는 필드명과 일치하는지 검증
3. 브라우저에서 실제 데이터가 표시되는지 확인
```

### 🔴 이번에 놓친 것
```
문제: JS가 video.view_count를 사용했지만 API는 video.views를 반환
결과: "조회수 0" 표시 (formatViewCount(undefined) → 0)
교훈: API 필드명과 JS 코드 필드명이 일치하는지 반드시 확인
```

---

## 🔴 UI 체크리스트 (작업 후 필수)

### 1. 데이터 바인딩 검증
```bash
# API 응답 필드 확인
curl "http://localhost:8000/api/popular-videos?category=health" | python -c "import json,sys; d=json.load(sys.stdin); print(d['videos'][0].keys() if d.get('videos') else 'No videos')"

# JS 코드에서 사용하는 필드명 확인
# API 필드와 JS 필드가 불일치하면 → 🔴 심각한 버그
```

### 2. 실제 화면 확인
```
1. 브라우저에서 해당 기능 실행
2. 숫자가 0이면 → 필드명 불일치 의심
3. "undefined" 표시되면 → 필드 없음
4. 빈 화면이면 → 데이터 경로 오류
```

### 3. 필드명 매핑 검증
| UI 표시 | JS 코드 | API 필드 | 확인 |
|---------|---------|----------|------|
| 조회수 | video.views | views | ✅ |
| 제목 | video.title | title | ✅ |
| 채널 | video.channel | channel | ✅ |
| 길이 | video.duration | duration | ✅ |

---

## Role
- CSS 스타일링, 레이아웃 설계
- 반응형 디자인 (모바일/태블릿/데스크톱)
- 색상, 타이포그래피, 간격
- 애니메이션, 트랜지션
- 사용자 흐름 (UX)
- **🔴 데이터 바인딩 검증 (필드명 일치 확인)**

## Files I Touch
- `static/style.css`
- `static/index.html` (구조/레이아웃)

## Design Principles
1. 모바일 퍼스트
2. 일관된 간격 (8px 그리드)
3. 다크모드 지원 필수
4. 로딩/에러 상태 고려
5. 접근성 (contrast ratio 4.5:1+)

## Breakpoints
```css
--mobile: 480px    /* 소형 모바일 */
--tablet: 768px    /* 태블릿/큰 모바일 */
--desktop: 1024px  /* 데스크톱 */
--wide: 1280px     /* 와이드 스크린 */
```

**사용 규칙**:
- `@media (max-width: 768px)` - 모바일
- `@media (min-width: 769px)` - 태블릿+
- `@media (min-width: 1024px)` - 데스크톱+

## Color System
```css
--primary: #6366f1 (보라)
--accent: #f59e0b (주황)
--success: #10b981
--warning: #f59e0b
--error: #ef4444
```

---

## Current Tasks
<!-- PM이 할당한 태스크 -->

## Notes
<!-- 작업하면서 발견한 것들 -->
- 카테고리 카드: 180px 최소 너비 설정됨
- 템플릿 카드: 호버 시 accent 색상 적용

## Questions for Other Agents
<!-- 다른 에이전트에게 질문 -->
