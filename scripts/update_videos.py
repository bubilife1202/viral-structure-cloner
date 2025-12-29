#!/usr/bin/env python3
"""
YouTube 인기 쇼츠 수집 배치 스크립트 v2

10개 카테고리별로 최근 7일간 바이럴 쇼츠를 수집하여
data/popular_videos.json에 저장합니다.

v2 변경사항:
- 구독자 수 수집
- 바이럴 지수 (조회수/구독자수) 계산
- 필터 조건 적용 (구독자 1천~100만, 조회수 1만+, 바이럴 2배+)
- 바이럴 지수 순 정렬
- 업로드 날짜 표시
"""

import os
import sys
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

# 프로젝트 루트 경로 설정 (scripts 폴더 기준 상위 디렉토리)
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# .env 파일에서 환경변수 로드
from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

# Google API 클라이언트
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# 카테고리 정의 (메인 검색어, 대체 검색어)
CATEGORIES = {
    "health": ("건강 쇼츠", "건강 유튜브"),
    "finance": ("재테크 쇼츠", "재테크 유튜브"),
    "food": ("요리 레시피 쇼츠", "요리 유튜브"),
    "tech": ("IT 쇼츠", "IT 유튜브"),
    "selfdev": ("자기계발 쇼츠", "자기계발 유튜브"),
    "beauty": ("뷰티 쇼츠", "뷰티 유튜브"),
    "travel": ("여행 쇼츠", "여행 유튜브"),
    "game": ("게임 쇼츠", "게임 유튜브"),
    "pet": ("반려동물 쇼츠", "반려동물 유튜브"),
    "humor": ("유머 쇼츠", "유머 유튜브"),
}

# 필터 조건
MIN_SUBSCRIBERS = 1_000       # 최소 구독자 1,000명
MAX_SUBSCRIBERS = 1_000_000   # 최대 구독자 100만명
MIN_VIEWS = 10_000            # 최소 조회수 1만
MIN_VIRAL_RATIO = 2.0         # 최소 바이럴 지수 2배


def get_youtube_client():
    """YouTube Data API v3 클라이언트 생성"""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY 환경변수가 설정되지 않았습니다.")
    return build("youtube", "v3", developerKey=api_key)


def format_count(count: int) -> str:
    """숫자를 읽기 쉬운 형식으로 변환 (예: 12300 -> '1.2만')"""
    if count >= 100_000_000:
        return f"{count / 100_000_000:.1f}억"
    elif count >= 10_000:
        return f"{count / 10_000:.1f}만"
    elif count >= 1_000:
        return f"{count / 1_000:.1f}천"
    else:
        return str(count)


def format_duration(iso_duration: str) -> str:
    """ISO 8601 duration을 읽기 쉬운 형식으로 변환 (예: PT1M30S -> '1:30')"""
    duration = iso_duration.replace("PT", "")

    hours = 0
    minutes = 0
    seconds = 0

    if "H" in duration:
        hours, duration = duration.split("H")
        hours = int(hours)
    if "M" in duration:
        minutes, duration = duration.split("M")
        minutes = int(minutes)
    if "S" in duration:
        seconds = int(duration.replace("S", ""))

    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes}:{seconds:02d}"


def format_relative_time(published_at: str) -> str:
    """ISO 날짜를 상대적 시간으로 변환 (예: '3일 전')"""
    try:
        # ISO 형식 파싱 (예: 2025-12-23T10:30:00Z)
        pub_date = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = now - pub_date

        days = diff.days
        hours = diff.seconds // 3600

        if days == 0:
            if hours < 1:
                return "방금 전"
            return f"{hours}시간 전"
        elif days == 1:
            return "1일 전"
        elif days < 7:
            return f"{days}일 전"
        elif days < 30:
            weeks = days // 7
            return f"{weeks}주 전"
        else:
            months = days // 30
            return f"{months}개월 전"
    except Exception:
        return ""


def search_shorts(youtube, query: str, max_results: int = 50) -> list:
    """
    YouTube 쇼츠 검색 (더 많이 가져와서 필터링)
    """
    published_after = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    try:
        search_response = youtube.search().list(
            q=query,
            part="id,snippet",
            type="video",
            videoDuration="short",
            publishedAfter=published_after,
            order="viewCount",
            maxResults=max_results,  # 필터링을 위해 더 많이 가져옴
            regionCode="KR",
            relevanceLanguage="ko",
        ).execute()

        return search_response.get("items", [])

    except HttpError as e:
        print(f"  검색 오류 ({query}): {e}")
        return []


def get_channel_subscribers(youtube, channel_ids: list) -> dict:
    """
    채널 구독자 수 조회

    Returns:
        채널 ID를 키로 하는 구독자 수 딕셔너리
    """
    if not channel_ids:
        return {}

    # 중복 제거
    unique_ids = list(set(channel_ids))

    try:
        # 50개씩 분할 (API 제한)
        subscribers = {}
        for i in range(0, len(unique_ids), 50):
            batch = unique_ids[i:i+50]
            response = youtube.channels().list(
                part="statistics",
                id=",".join(batch),
            ).execute()

            for item in response.get("items", []):
                channel_id = item["id"]
                stats = item.get("statistics", {})
                # 구독자 수가 숨겨진 경우 0으로 처리
                sub_count = int(stats.get("subscriberCount", 0))
                subscribers[channel_id] = sub_count

        return subscribers

    except HttpError as e:
        print(f"  채널 정보 조회 오류: {e}")
        return {}


def get_video_details(youtube, video_ids: list) -> dict:
    """
    비디오 상세 정보 조회 (채널 ID 포함)
    """
    if not video_ids:
        return {}

    try:
        videos_response = youtube.videos().list(
            part="snippet,statistics,contentDetails",
            id=",".join(video_ids),
        ).execute()

        details = {}
        for item in videos_response.get("items", []):
            video_id = item["id"]
            snippet = item.get("snippet", {})
            statistics = item.get("statistics", {})
            content_details = item.get("contentDetails", {})

            view_count = int(statistics.get("viewCount", 0))

            details[video_id] = {
                "id": video_id,
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "channel_id": snippet.get("channelId", ""),
                "views_raw": view_count,
                "views": format_count(view_count),
                "duration": format_duration(content_details.get("duration", "PT0S")),
                "uploaded_at": format_relative_time(snippet.get("publishedAt", "")),
                "url": f"https://www.youtube.com/shorts/{video_id}",
            }

        return details

    except HttpError as e:
        print(f"  비디오 상세 조회 오류: {e}")
        return {}


def fetch_popular_videos_for_category(youtube, category: str, queries: tuple) -> list:
    """
    특정 카테고리의 바이럴 쇼츠 수집 (필터링 + 바이럴 지수 정렬)
    """
    main_query, fallback_query = queries

    print(f"[{category}] 검색 중: '{main_query}'")
    search_results = search_shorts(youtube, main_query, max_results=50)

    if not search_results:
        print(f"  결과 없음. 대체 검색어로 재시도: '{fallback_query}'")
        search_results = search_shorts(youtube, fallback_query, max_results=50)

    if not search_results:
        print(f"  [{category}] 검색 결과 없음 - 카테고리 제외")
        return []

    # 비디오 ID 추출
    video_ids = [item["id"]["videoId"] for item in search_results if "videoId" in item.get("id", {})]

    if not video_ids:
        return []

    # 비디오 상세 정보 조회
    details = get_video_details(youtube, video_ids)

    if not details:
        return []

    # 채널 ID 수집 및 구독자 수 조회
    channel_ids = [d["channel_id"] for d in details.values() if d.get("channel_id")]
    subscribers = get_channel_subscribers(youtube, channel_ids)

    # 바이럴 지수 계산 및 필터링
    filtered_videos = []

    for video_id, video in details.items():
        channel_id = video.get("channel_id", "")
        sub_count = subscribers.get(channel_id, 0)
        view_count = video.get("views_raw", 0)

        # 필터 조건 체크
        if sub_count < MIN_SUBSCRIBERS:
            continue
        if sub_count > MAX_SUBSCRIBERS:
            continue
        if view_count < MIN_VIEWS:
            continue

        # 바이럴 지수 계산
        viral_ratio = view_count / sub_count if sub_count > 0 else 0

        if viral_ratio < MIN_VIRAL_RATIO:
            continue

        # 결과에 추가
        video["subscribers_raw"] = sub_count
        video["subscribers"] = format_count(sub_count)
        video["viral_ratio"] = round(viral_ratio, 1)

        # views_raw, subscribers_raw 는 정렬용이므로 최종 결과에서 제거
        filtered_videos.append(video)

    # 바이럴 지수 내림차순 정렬
    filtered_videos.sort(key=lambda x: x.get("viral_ratio", 0), reverse=True)

    # 상위 10개만 선택
    top_videos = filtered_videos[:10]

    # 정렬용 필드 제거
    for v in top_videos:
        v.pop("views_raw", None)
        v.pop("subscribers_raw", None)
        v.pop("channel_id", None)

    print(f"  [{category}] 필터 통과: {len(filtered_videos)}개 → 상위 {len(top_videos)}개 선택")
    return top_videos


def main():
    """메인 실행 함수"""
    print("=" * 60)
    print("YouTube 바이럴 쇼츠 수집 v2")
    print(f"수집 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"필터: 구독자 {format_count(MIN_SUBSCRIBERS)}~{format_count(MAX_SUBSCRIBERS)}, "
          f"조회수 {format_count(MIN_VIEWS)}+, 바이럴 {MIN_VIRAL_RATIO}배+")
    print("=" * 60)

    # YouTube API 클라이언트 생성
    try:
        youtube = get_youtube_client()
    except ValueError as e:
        print(f"오류: {e}")
        sys.exit(1)

    # 카테고리별 수집
    categories_data = {}

    for category, queries in CATEGORIES.items():
        videos = fetch_popular_videos_for_category(youtube, category, queries)
        if videos:
            categories_data[category] = videos

    # 결과 저장
    result = {
        "updated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "filter_config": {
            "min_subscribers": MIN_SUBSCRIBERS,
            "max_subscribers": MAX_SUBSCRIBERS,
            "min_views": MIN_VIEWS,
            "min_viral_ratio": MIN_VIRAL_RATIO,
        },
        "categories": categories_data,
    }

    # data 디렉토리 확인 및 생성
    data_dir = PROJECT_ROOT / "data"
    data_dir.mkdir(exist_ok=True)

    output_path = data_dir / "popular_videos.json"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total_videos = sum(len(v) for v in categories_data.values())
    print("=" * 60)
    print(f"수집 완료!")
    print(f"총 {len(categories_data)}개 카테고리, {total_videos}개 바이럴 영상")
    print(f"저장 위치: {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
