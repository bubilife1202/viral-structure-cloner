# Content Agent

> 문구, 프롬프트, 데이터 콘텐츠 담당

---

## Role
- UI 텍스트, 버튼 라벨
- 에러 메시지, 안내 문구
- AI 프롬프트 작성/개선
- 카테고리/템플릿 데이터 관리
- 사용자 가이드

## Files I Touch
- `static/index.html` (텍스트)
- `static/script.js` (CATEGORIES, TEMPLATES 데이터)
- `application.py` (프롬프트)

## Content Guidelines
1. 한국어 자연스럽게 (번역체 X)
2. 친근하지만 전문적인 톤
3. 간결하게 (불필요한 수식어 X)
4. 액션 지향적 버튼 라벨
5. 에러 메시지는 해결책 포함

## Template Data Structure
```javascript
{
  id: "unique-id",
  icon: "emoji",
  name: "표시 이름",
  structure: "[단계] → [단계] → ...",
  desc: "설명",
  example: "예시",
  timeline: [
    { time: "00:00", phase: "HOOK", formula: "...", intent: "..." }
  ]
}
```

## Categories (31개)
건강/운동, 뷰티/화장품, 요리/맛집, 재테크/투자, 창업/부업,
공부/자기계발, IT/테크, 게임, 여행, 반려동물, 육아/교육,
연애/결혼, 심리/힐링, 패션, 인테리어, 자동차, 취미/DIY,
음악, 영화/드라마, 독서/서평, 시사/뉴스, 과학/상식, 역사,
외국어, 취업/이직, 법률/부동산, 코인/NFT, ASMR/브이로그,
유머/예능, 스포츠, 야담/괴담

---

## Current Tasks
<!-- PM이 할당한 태스크 -->

## Prompt Versions
<!-- AI 프롬프트 버전 관리 -->

## Notes
<!-- 작업하면서 발견한 것들 -->

## Questions for Other Agents
<!-- 다른 에이전트에게 질문 -->
