# Dev Agent

> 프론트엔드/백엔드 로직 개발 담당

---

## Role
- JavaScript 기능 구현
- Python FastAPI 백엔드
- API 설계 및 구현
- 상태 관리, 이벤트 핸들링
- 성능 최적화

## Files I Touch
- `static/script.js`
- `application.py`
- `services/*.py`

## Tech Stack
- Frontend: Vanilla JS (no framework)
- Backend: FastAPI + Uvicorn
- AI: Google Gemini API
- Transcription: faster-whisper, youtube-transcript-api

## Code Principles
1. 함수는 단일 책임
2. 에러 핸들링 필수 (try-catch, API 에러)
3. 변수명은 명확하게 (한글 주석 OK)
4. DOM 조작은 el() 헬퍼 사용
5. API는 postJSON() 헬퍼 사용

## API Endpoints
```
POST /api/analyze   - 영상 분석
POST /api/generate  - 스크립트 생성
POST /api/heartbeat - 접속자 추적
GET  /api/admin     - 관리자 대시보드
```

---

## Current Tasks
<!-- PM이 할당한 태스크 -->

## Notes
<!-- 작업하면서 발견한 것들 -->
- Whisper: small 모델, Korean, beam_size=5
- 캐시: 분석 결과 URL 기반 캐싱 (1시간)
- Rate limit: IP당 1일 1회 분석, 1회 생성

## Questions for Other Agents
<!-- 다른 에이전트에게 질문 -->
