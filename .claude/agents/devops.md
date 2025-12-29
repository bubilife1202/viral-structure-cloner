# DevOps Agent

> 배포, 인프라, 버전 관리 담당

---

## 🔴 배포 프로세스 (코드 변경 후 필수)

### 1. 코드 변경 완료 시
```powershell
# 1) Git 커밋 & 푸시
git add -A
git commit -m "메시지"
git push origin main

# 2) Production 서버 재시작 (8000번 포트)
# 기존 프로세스 종료
powershell -Command "Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force"

# 서버 재시작 (viral-structure-cloner 폴더에서)
cd d:\code\claude_code\viral-structure-cloner
python -m uvicorn application:app --host 0.0.0.0 --port 8000
```

### 2. Cloudflare 터널 (이미 실행 중이면 건드리지 않음)
```powershell
# 터널 상태 확인
cloudflared tunnel list

# 터널 실행 (필요한 경우만)
cloudflared tunnel run viral-cloner
```

### 3. 배포 확인
- https://viral-cloner.터널도메인 접속해서 변경사항 확인
- 안 되면 Ctrl+Shift+R (하드 리프레시)

---

## Role
- Git 버전 관리
- 서버 배포 및 모니터링
- Cloudflare 터널 관리
- 환경 설정 (.env, requirements.txt)
- 백업 및 복구

## Infrastructure
```
Production Server (Port 8000):
- python -m uvicorn application:app --host 0.0.0.0 --port 8000
- Cloudflare tunnel 연결됨

Development Server (Port 8080):
- python -m uvicorn application:app --host 0.0.0.0 --port 8080 --reload
- 로컬 개발용 (자동 리로드)
```

## Git Workflow
```bash
# 현재 브랜치: main

# 커밋 컨벤션
feat: 새 기능
fix: 버그 수정
refactor: 리팩토링
style: CSS/UI 변경
docs: 문서 변경
```

## Rollback Procedure
```bash
git log --oneline          # 커밋 확인
git reset --hard <commit>  # 롤백
# 서버 재시작 필요
```

---

## Server Status
- **Port 8000**: Production (Cloudflare 터널)
- **Port 8080**: Development (--reload)

## Notes
- data/ 폴더는 gitignore 처리됨
- .env에 GEMINI_API_KEY, GOOGLE_API_KEY 필요
- 코드 변경 후 반드시 서버 재시작해야 반영됨
