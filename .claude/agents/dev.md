# Dev Agent

> 프론트엔드/백엔드 로직 개발 담당

---

## 🔴 필수 규칙: 코드 수정 후 테스트

```
❌ "코드 수정했습니다" → 허용 안 함
✅ "코드 수정하고 API 테스트까지 완료했습니다" → OK

코드 수정 후 반드시:
1. 서버 재시작 (또는 --reload 확인)
2. curl로 API 직접 호출
3. 응답 정상 확인 후에만 "완료"
```

**서버 포트: 8000** (PROJECT.md 참고)

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
- Backend: FastAPI + Uvicorn (포트 8000)
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
POST /api/analyze         - 영상 분석
POST /api/generate        - 스크립트 생성
POST /api/heartbeat       - 접속자 추적
GET  /api/popular-videos  - 인기 영상 목록
GET  /admin               - 관리자 대시보드
```

---

## 🔴 API 수정 시 필수 테스트

```bash
# 1. 서버 포트 확인
curl http://localhost:8000/

# 2. API 응답 테스트
curl "http://localhost:8000/api/popular-videos?category=health"

# 3. 데이터 구조 확인 (JSON 파일과 코드 경로 일치 여부)
python -c "import json; print(json.load(open('data/popular_videos.json')).keys())"
```

**"완료"라고 말하기 전에 위 테스트 통과 필수**

---

## Current Tasks
<!-- PM이 할당한 태스크 -->

## Notes
<!-- 작업하면서 발견한 것들 -->
- Whisper: small 모델, Korean, beam_size=5
- 캐시: 분석 결과 URL 기반 캐싱 (1시간)
- Rate limit: IP당 1일 1회 분석, 1회 생성
- **서버 포트: 8000**

## Questions for Other Agents
<!-- 다른 에이전트에게 질문 -->
