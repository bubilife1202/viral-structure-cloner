# Project: Viral Structure Cloner

## 서버 설정

| 항목 | 값 |
|------|-----|
| **포트** | 8000 |
| **실행 명령** | `uvicorn application:app --host 0.0.0.0 --port 8000 --reload` |
| **로컬 URL** | http://localhost:8000 |

---

## 필수 테스트 체크리스트 (코드 수정 후)

### 1. 서버 재시작 확인
```bash
# 서버 재시작 후 테스트
curl http://localhost:8000/
```

### 2. API 엔드포인트 테스트
```bash
# 인기 영상 API
curl "http://localhost:8000/api/popular-videos?category=health"
# 예상 결과: {"videos": [...]} (10개 영상)

# 분석 API
curl -X POST http://localhost:8000/api/analyze -H "Content-Type: application/json" -d '{"url":"https://youtube.com/shorts/xxx"}'
```

### 3. 데이터 파일 검증
```bash
# JSON 구조 확인
python -c "import json; d=json.load(open('data/popular_videos.json')); print(list(d.keys())); print(list(d.get('categories',{}).keys()))"
# 예상: ['updated_at', 'categories'], ['health', 'finance', ...]
```

---

## 코드 수정 후 반드시 할 일

1. **서버 재시작** - 코드 변경 반영
2. **API 직접 호출 테스트** - curl로 실제 응답 확인
3. **브라우저에서 기능 테스트** - UI 동작 확인
4. **"완료"라고 말하기 전에 실제 동작 확인**

---

## 파일 구조

```
viral-structure-cloner/
├── application.py          # FastAPI 메인 (포트 8000)
├── data/
│   └── popular_videos.json # 인기 영상 데이터
├── static/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── services/
│   ├── youtube.py
│   └── ai_engine.py
└── scripts/
    └── update_videos.py    # 영상 업데이트 배치
```

---

## 자주 발생하는 실수

| 실수 | 해결 |
|------|------|
| API 수정 후 안 됨 | **서버 재시작 필수** |
| JSON 경로 오류 | 실제 파일 열어서 구조 확인 |
| 포트 번호 실수 | **항상 8000번 사용** |
| 테스트 안 하고 완료 | **curl로 실제 호출 후 완료 처리** |
