from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig
from urllib.parse import urlparse, parse_qs
import sys
import glob
import os

from yt_dlp import YoutubeDL

def get_transcript(url):
    """
    Extracts video ID from URL and fetches transcript.
    Returns a dict: { "text": "...", "duration": seconds or None } or None if failed.
    """
    try:
        video_id = None
        parsed_url = urlparse(url)

        if parsed_url.hostname == 'youtu.be':
            video_id = parsed_url.path[1:]
        if parsed_url.hostname in ('www.youtube.com', 'youtube.com'):
            if parsed_url.path == '/watch':
                p = parse_qs(parsed_url.query)
                video_id = p['v'][0]
            if parsed_url.path[:7] == '/embed/':
                video_id = parsed_url.path.split('/')[2]
            if parsed_url.path[:3] == '/v/':
                video_id = parsed_url.path.split('/')[2]
            if parsed_url.path[:8] == '/shorts/':
                video_id = parsed_url.path.split('/')[2]

        if not video_id:
            print(f"Failed to extract video_id from: {url}")
            return None

        print(f"Extracted video_id: {video_id} from {url}")

        # Method 1: youtube_transcript_api (New API for version 1.2.3+)
        try:
            api = YouTubeTranscriptApi()

            # Try fetching transcript with preferred languages
            try:
                transcript_items = api.fetch(video_id, languages=['ko', 'en', 'en-US'])
            except Exception:
                # If specific languages fail, try fetching default
                transcript_items = api.fetch(video_id)

            # Convert to list if needed
            if hasattr(transcript_items, '__iter__'):
                transcript_items = list(transcript_items)

            full_text = " ".join(item.text for item in transcript_items).strip()
            duration = 0.0
            if transcript_items:
                last = transcript_items[-1]
                duration = float(getattr(last, 'start', 0) + getattr(last, 'duration', 0))

            if full_text:
                return {"text": full_text, "duration": duration or None}

        except Exception as e:
            print(f"youtube_transcript_api failed: {e}")

            # Method 2: yt-dlp fallback (library call)
            try:
                print("Attempting yt-dlp fallback...")
                output_template = f"transcript_{video_id}.%(ext)s"

                # Clean up old files
                for f in glob.glob(f"transcript_{video_id}*"):
                    os.remove(f)

                ydl_opts = {
                    "skip_download": True,
                    "writesubtitles": True,
                    "writeautomaticsub": True,
                    "subtitleslangs": ["ko", "en"],
                    "outtmpl": output_template,
                    "quiet": True,
                }

                with YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])

                # Find the downloaded vtt file
                files = glob.glob(f"transcript_{video_id}*.vtt")
                if not files:
                    return None

                vtt_file = files[0]

                # Simple VTT parser (skipping timestamps) - duration unavailable here
                text_content = []
                with open(vtt_file, 'r', encoding='utf-8') as f:
                    seen_lines = set()
                    for line in f:
                        line = line.strip()
                        if '-->' in line or not line or line == 'WEBVTT':
                            continue
                        if line not in seen_lines:
                            text_content.append(line)
                            seen_lines.add(line)

                # Cleanup
                for f_path in glob.glob(f"transcript_{video_id}*"):
                    os.remove(f_path)

                return {"text": " ".join(text_content), "duration": None}

            except Exception as e2:
                print(f"yt-dlp fallback failed: {e2}")
                return None

    except Exception as e:
        print(f"Error fetching transcript: {e}")
        return None
