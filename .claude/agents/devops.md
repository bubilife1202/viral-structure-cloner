# DevOps Agent

> 배포, 인프라, 버전 관리 담당

---

## Role
- Git 버전 관리
- 서버 배포 및 모니터링
- Cloudflare 터널 관리
- 환경 설정 (.env, requirements.txt)
- 백업 및 복구

## Infrastructure
```
Local Server:
- uvicorn application:app --port 8000
- cloudflared tunnel --url http://localhost:8000 run viral-cloner

Domain: viral-cloner 터널 (Cloudflare)
```

## Git Workflow
```bash
# 현재 브랜치
claude/viral-structure-cloner-015d2gz6FRQni4Na2KGKhoFk

# 커밋 컨벤션
feat: 새 기능
fix: 버그 수정
refactor: 리팩토링
style: CSS/UI 변경
docs: 문서 변경
```

## Files I Touch
- `.gitignore`
- `requirements.txt`
- `.env`
- 서버 프로세스 관리

## Rollback Procedure
```bash
git log --oneline          # 커밋 확인
git reset --hard <commit>  # 롤백
# 서버 재시작 필요
```

---

## Current Tasks
<!-- PM이 할당한 태스크 -->

## Server Status
- Port 8000: Production (cloudflared)
- Port 8080: Development (--reload)

## Notes
<!-- 작업하면서 발견한 것들 -->
- data/ 폴더는 gitignore 처리됨
- .env에 GEMINI_API_KEY 필요

## Questions for Other Agents
<!-- 다른 에이전트에게 질문 -->
