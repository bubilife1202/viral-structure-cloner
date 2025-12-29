import os
import sys
import time
import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from services.youtube import get_transcript
from services.ai_engine import analyze_structure, generate_script

# 실시간 접속자 추적
ACTIVE_USERS: Dict[str, float] = {}  # session_id -> last_heartbeat_time
TOTAL_VISITORS: set = set()  # 누적 방문자 (세션 ID 저장)
HEARTBEAT_TIMEOUT = 30  # 30초 동안 heartbeat 없으면 비활성으로 간주

# 데이터 저장 경로
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DATA_FILE = DATA_DIR / "usage_data.json"

# IP별 사용 제한 (하루 1회씩)
IP_USAGE_ANALYZE: Dict[str, float] = {}  # 분석 제한
IP_USAGE_GENERATE: Dict[str, float] = {}  # 스크립트 제한
DAILY_LIMIT_SECONDS = 24 * 60 * 60  # 24시간

# 활동 로그 (최근 100개)
ACTIVITY_LOG: List[Dict] = []
MAX_LOG_SIZE = 100


def save_data():
    """데이터를 파일에 저장"""
    data = {
        "ip_usage_analyze": IP_USAGE_ANALYZE,
        "ip_usage_generate": IP_USAGE_GENERATE,
        "whitelist_ips": list(WHITELIST_IPS),
        "activity_log": ACTIVITY_LOG[-MAX_LOG_SIZE:]
    }
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_data():
    """파일에서 데이터 로드"""
    global IP_USAGE_ANALYZE, IP_USAGE_GENERATE, WHITELIST_IPS, ACTIVITY_LOG
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            IP_USAGE_ANALYZE = data.get("ip_usage_analyze", {})
            IP_USAGE_GENERATE = data.get("ip_usage_generate", {})
            WHITELIST_IPS = set(data.get("whitelist_ips", []))
            ACTIVITY_LOG = data.get("activity_log", [])
        except:
            pass


def log_activity(action: str, ip: str, details: str):
    """활동 로그 기록"""
    ACTIVITY_LOG.append({
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "action": action,
        "ip": ip,
        "details": details
    })
    if len(ACTIVITY_LOG) > MAX_LOG_SIZE:
        ACTIVITY_LOG.pop(0)
    save_data()


# 시작 시 데이터 로드
load_data()

# 관리자 IP 화이트리스트 (제한 없음)
ADMIN_IPS = {
    "127.0.0.1",
    "localhost",
    "::1",
    
}

# 동적 화이트리스트 (admin에서 추가/제거 가능)
WHITELIST_IPS: set = set()

# 관리자 페이지 비밀번호
ADMIN_PASSWORD = "my-test-key"


def get_client_ip(request: Request) -> str:
    """클라이언트 IP 추출 (프록시 고려)"""
    # 여러 프록시 헤더 확인
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()

    return request.client.host if request.client else "unknown"


def check_daily_limit(ip: str, usage_type: str = "analyze") -> tuple[bool, int]:
    """IP별 일일 사용 제한 확인. (허용여부, 남은시간초) 반환"""
    # 관리자 IP 또는 화이트리스트는 항상 허용
    if ip in ADMIN_IPS or ip in WHITELIST_IPS:
        return True, 0

    ip_usage = IP_USAGE_ANALYZE if usage_type == "analyze" else IP_USAGE_GENERATE

    if ip not in ip_usage:
        return True, 0

    last_usage = ip_usage[ip]
    elapsed = time.time() - last_usage

    if elapsed >= DAILY_LIMIT_SECONDS:
        return True, 0

    remaining = int(DAILY_LIMIT_SECONDS - elapsed)
    return False, remaining


def record_usage(ip: str, usage_type: str = "analyze"):
    """IP 사용 기록 (관리자 IP 제외)"""
    if ip not in ADMIN_IPS and ip not in WHITELIST_IPS:
        if usage_type == "analyze":
            IP_USAGE_ANALYZE[ip] = time.time()
        else:
            IP_USAGE_GENERATE[ip] = time.time()
        save_data()


def get_config_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def get_static_dir() -> Path:
    if getattr(sys, "_MEIPASS", None):
        return Path(sys._MEIPASS) / "static"
    return Path(__file__).resolve().parent / "static"


CONFIG_DIR = get_config_dir()
STATIC_DIR = get_static_dir()
ENV_PATH = CONFIG_DIR / ".env"
load_dotenv(ENV_PATH)

app = FastAPI(title="YouTube Pattern Benchmark", docs_url=None, redoc_url=None)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# 간단한 메모리 캐시: 동일 URL은 같은 분석 결과를 반환
ANALYSIS_CACHE: Dict[str, Any] = {}


class AnalyzeRequest(BaseModel):
    url: str


class GenerateRequest(BaseModel):
    topic: str
    analysis: Dict[str, Any]
    tone: Optional[str] = None
    style: Optional[str] = None
    audience: Optional[str] = None
    category: Optional[str] = None  # 카테고리 기반 생성용
    template: Optional[str] = None  # 템플릿 구조명


@app.get("/")
def root():
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/analyze")
def api_analyze(payload: AnalyzeRequest, request: Request):
    if not payload.url:
        raise HTTPException(status_code=400, detail="URL is required")

    # IP별 일일 사용 제한 체크 (분석)
    client_ip = get_client_ip(request)
    allowed, remaining = check_daily_limit(client_ip, "analyze")

    if not allowed:
        hours = remaining // 3600
        minutes = (remaining % 3600) // 60
        raise HTTPException(
            status_code=429,
            detail=f"일일 분석 한도를 초과했습니다. {hours}시간 {minutes}분 후에 다시 시도해주세요. 무제한 사용 문의: https://litt.ly/reels_code_official/sale/XdbLaGW"
        )

    if payload.url in ANALYSIS_CACHE:
        log_activity("분석(캐시)", client_ip, payload.url)
        return JSONResponse(ANALYSIS_CACHE[payload.url])

    log_activity("분석 시작", client_ip, payload.url)

    transcript = get_transcript(payload.url)
    if not transcript:
        log_activity("분석 실패", client_ip, f"{payload.url} - 자막 추출 실패")
        raise HTTPException(status_code=400, detail="Failed to fetch transcript.")

    text = transcript.get("text") if isinstance(transcript, dict) else transcript
    duration = transcript.get("duration") if isinstance(transcript, dict) else None
    result = analyze_structure(text, duration_seconds=duration)
    if not result:
        log_activity("분석 실패", client_ip, f"{payload.url} - AI 분석 실패")
        raise HTTPException(status_code=500, detail="Analysis failed.")
    if isinstance(result, dict) and result.get("error"):
        log_activity("분석 실패", client_ip, f"{payload.url} - {result.get('error')}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {result.get('error')}")

    ANALYSIS_CACHE[payload.url] = result

    # 분석 성공 시 사용 기록
    record_usage(client_ip, "analyze")

    # 영상 길이 포맷팅
    duration_str = ""
    if duration:
        mins = int(duration) // 60
        secs = int(duration) % 60
        duration_str = f" ({mins}분 {secs}초)"

    log_activity("분석 완료", client_ip, f"{payload.url}{duration_str}")

    return JSONResponse(result)


@app.post("/api/generate")
def api_generate(payload: GenerateRequest, request: Request):
    if not payload.topic:
        raise HTTPException(status_code=400, detail="Topic is required")
    if not payload.analysis:
        raise HTTPException(status_code=400, detail="Analysis result is required")

    # IP별 일일 사용 제한 체크 (스크립트)
    client_ip = get_client_ip(request)
    allowed, remaining = check_daily_limit(client_ip, "generate")

    if not allowed:
        hours = remaining // 3600
        minutes = (remaining % 3600) // 60
        raise HTTPException(
            status_code=429,
            detail=f"일일 스크립트 생성 한도를 초과했습니다. {hours}시간 {minutes}분 후에 다시 시도해주세요. 무제한 사용 문의: https://litt.ly/reels_code_official/sale/XdbLaGW"
        )

    script = generate_script(
        payload.analysis,
        payload.topic,
        payload.tone,
        payload.style,
        payload.audience,
        payload.category,
        payload.template,
    )
    if not script:
        raise HTTPException(status_code=500, detail="Failed to generate script.")

    # 스크립트 생성 성공 시 사용 기록
    record_usage(client_ip, "generate")

    # 카테고리 기반인지 URL 기반인지 구분하여 로그
    if payload.category and payload.template:
        log_activity("스크립트(템플릿)", client_ip, f"{payload.topic} [{payload.category}:{payload.template}]")
    else:
        log_activity("스크립트", client_ip, f"{payload.topic} ({payload.tone}/{payload.style})")

    return {"script": script}


def get_active_user_count() -> int:
    """활성 사용자 수 계산 (타임아웃된 사용자 제거)"""
    current_time = time.time()
    expired = [sid for sid, last_time in ACTIVE_USERS.items()
               if current_time - last_time > HEARTBEAT_TIMEOUT]
    for sid in expired:
        del ACTIVE_USERS[sid]
    return len(ACTIVE_USERS)


class HeartbeatRequest(BaseModel):
    session_id: str


@app.post("/api/heartbeat")
def api_heartbeat(payload: HeartbeatRequest):
    """클라이언트 heartbeat 수신"""
    ACTIVE_USERS[payload.session_id] = time.time()
    # 누적 방문자 추가 (_leave 제외)
    if not payload.session_id.endswith('_leave'):
        TOTAL_VISITORS.add(payload.session_id)
    return {"status": "ok", "active_users": get_active_user_count()}


@app.get("/api/stats")
def api_stats():
    """실시간 접속자 통계"""
    current_time = time.time()
    
    # 분석 사용 현황
    analyze_status = {}
    for ip, last_time in IP_USAGE_ANALYZE.items():
        elapsed = current_time - last_time
        remaining = max(0, int(DAILY_LIMIT_SECONDS - elapsed))
        hours = remaining // 3600
        minutes = (remaining % 3600) // 60
        analyze_status[ip] = f"{hours}시간 {minutes}분" if remaining > 0 else "가능"
    
    # 스크립트 사용 현황
    generate_status = {}
    for ip, last_time in IP_USAGE_GENERATE.items():
        elapsed = current_time - last_time
        remaining = max(0, int(DAILY_LIMIT_SECONDS - elapsed))
        hours = remaining // 3600
        minutes = (remaining % 3600) // 60
        generate_status[ip] = f"{hours}시간 {minutes}분" if remaining > 0 else "가능"

    return {
        "active_users": get_active_user_count(),
        "total_visitors": len(TOTAL_VISITORS),
        "cached_analyses": len(ANALYSIS_CACHE),
        "blocked_analyze": len(IP_USAGE_ANALYZE),
        "blocked_generate": len(IP_USAGE_GENERATE),
        "analyze_status": analyze_status,
        "generate_status": generate_status,
        "whitelist_ips": list(WHITELIST_IPS),
        "activity_log": ACTIVITY_LOG[-20:][::-1]  # 최근 20개, 역순
    }


class AdminKeyRequest(BaseModel):
    key: str


@app.post("/api/activate-admin")
def api_activate_admin(payload: AdminKeyRequest, request: Request):
    """관리자 키로 무제한 사용 활성화"""
    client_ip = get_client_ip(request)

    if payload.key == ADMIN_PASSWORD:
        WHITELIST_IPS.add(client_ip)
        return {"success": True, "message": "무제한 사용이 활성화되었습니다.", "ip": client_ip}
    else:
        raise HTTPException(status_code=403, detail="잘못된 키입니다.")


@app.get("/api/check-admin")
def api_check_admin(request: Request):
    """현재 IP가 관리자/화이트리스트인지 확인"""
    client_ip = get_client_ip(request)
    is_admin = client_ip in ADMIN_IPS or client_ip in WHITELIST_IPS
    return {"is_admin": is_admin, "ip": client_ip}


@app.get("/admin/whitelist/add")
def add_whitelist(ip: str):
    """화이트리스트에 IP 추가"""
    if not ip:
        return {"success": False, "error": "IP 필요"}
    WHITELIST_IPS.add(ip.strip())
    # 해당 IP의 사용 기록 삭제 (즉시 사용 가능하도록)
    if ip.strip() in IP_USAGE_ANALYZE:
        del IP_USAGE_ANALYZE[ip.strip()]
    if ip.strip() in IP_USAGE_GENERATE:
        del IP_USAGE_GENERATE[ip.strip()]
    save_data()
    return {"success": True, "ip": ip.strip()}


@app.get("/admin/whitelist/remove")
def remove_whitelist(ip: str):
    """화이트리스트에서 IP 제거"""
    if not ip:
        return {"success": False, "error": "IP 필요"}
    WHITELIST_IPS.discard(ip.strip())
    save_data()
    return {"success": True, "ip": ip.strip()}


@app.get("/api/popular-videos")
def api_popular_videos(category: str = ""):
    """카테고리별 인기 영상 목록 반환"""
    popular_videos_file = DATA_DIR / "popular_videos.json"

    # 파일이 없으면 빈 배열 반환
    if not popular_videos_file.exists():
        return {"videos": []}

    try:
        with open(popular_videos_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 카테고리가 지정된 경우 해당 카테고리 영상만 반환
        # JSON 구조: {"updated_at": "...", "categories": {"health": [...], ...}}
        if category:
            videos = data.get("categories", {}).get(category, [])
        else:
            videos = []

        return {"videos": videos}
    except (json.JSONDecodeError, IOError):
        return {"videos": []}


@app.get("/admin")
def admin_page(pw: str = ""):
    """관리자 페이지 (비밀번호 필요)"""
    if pw != ADMIN_PASSWORD:
        return HTMLResponse(content="""
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>Admin Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
        }
        .login-box {
            background: rgba(255,255,255,0.1);
            padding: 2rem;
            border-radius: 16px;
            text-align: center;
        }
        input {
            padding: 0.75rem 1rem;
            border: none;
            border-radius: 8px;
            margin: 1rem 0;
            width: 200px;
        }
        button {
            padding: 0.75rem 2rem;
            background: #4ade80;
            border: none;
            border-radius: 8px;
            color: #000;
            font-weight: bold;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="login-box">
        <h2>Admin Login</h2>
        <form method="GET">
            <input type="password" name="pw" placeholder="비밀번호 입력">
            <br>
            <button type="submit">로그인</button>
        </form>
    </div>
</body>
</html>
        """)

    html = """
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>Admin Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #fff;
            padding: 2rem;
        }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { font-size: 1.5rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
        .stat-card { background: rgba(255,255,255,0.1); border-radius: 12px; padding: 1rem; }
        .stat-label { font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem; }
        .stat-value { font-size: 2rem; font-weight: 700; color: #4ade80; }
        .pulse { display: inline-block; width: 10px; height: 10px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .section { background: rgba(0,0,0,0.3); border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }
        .section-title { font-size: 0.9rem; margin-bottom: 0.75rem; color: #fbbf24; }
        .log-entry { font-family: monospace; font-size: 0.75rem; color: rgba(255,255,255,0.7); padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        input { padding: 6px 10px; border-radius: 4px; border: none; font-size: 0.8rem; }
        button { padding: 6px 12px; background: #4ade80; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.8rem; }
        .btn-danger { background: #f87171; }
        .activity-item { display: flex; gap: 0.5rem; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; }
        .activity-time { color: rgba(255,255,255,0.5); min-width: 140px; }
        .activity-action { padding: 2px 6px; border-radius: 4px; font-weight: bold; }
        .act-analyze { background: #3b82f6; }
        .act-start { background: #fbbf24; color: #000; }
        .act-success { background: #4ade80; color: #000; }
        .act-fail { background: #f87171; }
        .act-cache { background: #6b7280; }
        .act-script { background: #8b5cf6; }
        .activity-ip { color: #fbbf24; min-width: 120px; }
        .activity-details { color: rgba(255,255,255,0.8); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    </style>
</head>
<body>
    <div class="container">
        <h1><span class="pulse"></span> Admin Dashboard</h1>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">실시간 접속</div>
                <div class="stat-value" id="activeUsers">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">누적 방문</div>
                <div class="stat-value" id="totalVisitors" style="color:#60a5fa;">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">분석 사용</div>
                <div class="stat-value" id="blockedAnalyze" style="color:#3b82f6;">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">스크립트 사용</div>
                <div class="stat-value" id="blockedGenerate" style="color:#8b5cf6;">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">캐시</div>
                <div class="stat-value" id="cachedAnalyses" style="color:#fbbf24;">-</div>
            </div>
        </div>

        <div class="grid-2">
            <div class="section">
                <div class="section-title">분석 사용 현황 (24h 제한)</div>
                <div id="analyzeStatus"><div class="log-entry">로딩...</div></div>
            </div>
            <div class="section">
                <div class="section-title">스크립트 사용 현황 (24h 제한)</div>
                <div id="generateStatus"><div class="log-entry">로딩...</div></div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">🔑 무제한 사용 키</div>
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                <input type="text" id="adminKeyDisplay" value="" readonly style="flex:1; background:#2d3748; color:#4ade80; font-family:monospace;">
                <button onclick="copyAdminKey()">복사</button>
            </div>
            <div class="log-entry" style="color:#fbbf24;">이 키를 사용자에게 공유하면 무제한 사용 가능</div>
        </div>

        <div class="section">
            <div class="section-title">무제한 IP 화이트리스트</div>
            <div style="margin-bottom:8px;">
                <input type="text" id="whitelistIp" placeholder="IP 주소">
                <button onclick="addWhitelist()">추가</button>
            </div>
            <div id="whitelistStatus"><div class="log-entry">로딩...</div></div>
        </div>

        <div class="section">
            <div class="section-title">최근 활동 로그</div>
            <div id="activityLog"><div class="log-entry">로딩...</div></div>
        </div>
    </div>

    <script>
        async function fetchStats() {
            try {
                const res = await fetch('/api/stats');
                const data = await res.json();

                document.getElementById('activeUsers').textContent = data.active_users;
                document.getElementById('totalVisitors').textContent = data.total_visitors;
                document.getElementById('blockedAnalyze').textContent = data.blocked_analyze;
                document.getElementById('blockedGenerate').textContent = data.blocked_generate;
                document.getElementById('cachedAnalyses').textContent = data.cached_analyses;

                // 분석 현황
                const analyzeDiv = document.getElementById('analyzeStatus');
                const analyzeEntries = Object.entries(data.analyze_status || {});
                analyzeDiv.innerHTML = analyzeEntries.length > 0
                    ? analyzeEntries.map(([ip, status]) => `<div class="log-entry">${ip}: ${status}</div>`).join('')
                    : '<div class="log-entry">기록 없음</div>';

                // 스크립트 현황
                const genDiv = document.getElementById('generateStatus');
                const genEntries = Object.entries(data.generate_status || {});
                genDiv.innerHTML = genEntries.length > 0
                    ? genEntries.map(([ip, status]) => `<div class="log-entry">${ip}: ${status}</div>`).join('')
                    : '<div class="log-entry">기록 없음</div>';

                // 화이트리스트
                const wlDiv = document.getElementById('whitelistStatus');
                const wlList = data.whitelist_ips || [];
                wlDiv.innerHTML = wlList.length > 0
                    ? wlList.map(ip => `<div class="log-entry">${ip} <button class="btn-danger" onclick="removeWhitelist('${ip}')">제거</button></div>`).join('')
                    : '<div class="log-entry">비어있음</div>';

                // 활동 로그
                const actDiv = document.getElementById('activityLog');
                const actList = data.activity_log || [];
                actDiv.innerHTML = actList.length > 0
                    ? actList.map(a => {
                        let actionClass = 'act-script';
                        if (a.action === '분석 시작') actionClass = 'act-start';
                        else if (a.action === '분석 완료') actionClass = 'act-success';
                        else if (a.action === '분석 실패') actionClass = 'act-fail';
                        else if (a.action === '분석(캐시)') actionClass = 'act-cache';
                        else if (a.action === '분석') actionClass = 'act-analyze';
                        return `<div class="activity-item"><span class="activity-time">${a.time}</span><span class="activity-action ${actionClass}">${a.action}</span><span class="activity-ip">${a.ip}</span><span class="activity-details">${a.details}</span></div>`;
                    }).join('')
                    : '<div class="log-entry">활동 없음</div>';
            } catch (e) {
                console.error(e);
            }
        }

        async function addWhitelist() {
            const ip = document.getElementById('whitelistIp').value.trim();
            if (!ip) return alert('IP를 입력하세요');
            await fetch('/admin/whitelist/add?ip=' + encodeURIComponent(ip));
            document.getElementById('whitelistIp').value = '';
            fetchStats();
        }

        async function removeWhitelist(ip) {
            if (!confirm(ip + ' 제거?')) return;
            await fetch('/admin/whitelist/remove?ip=' + encodeURIComponent(ip));
            fetchStats();
        }

        function copyAdminKey() {
            const input = document.getElementById('adminKeyDisplay');
            input.select();
            document.execCommand('copy');
            alert('키가 복사되었습니다!');
        }

        // 관리자 키 표시
        document.getElementById('adminKeyDisplay').value = '""" + ADMIN_PASSWORD + """';

        fetchStats();
        setInterval(fetchStats, 3000);
    </script>
</body>
</html>
    """
    return HTMLResponse(content=html)
