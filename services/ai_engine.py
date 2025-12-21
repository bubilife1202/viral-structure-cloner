import os
import json
import time
from google import genai
from google.genai import types


def get_client():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in environment variables")
    return genai.Client(api_key=api_key)


def analyze_structure(transcript_text, duration_seconds=None):
    """
    Analyze transcript and return viral structure JSON.
    """
    try:
        client = get_client()

        duration_msg = ""
        if duration_seconds:
            duration_msg = (
                f"영상 길이: 약 {int(duration_seconds)}초. "
                "타임라인 구간은 전체 길이에 맞게 연속적으로 3~6개로 나누고, 마지막 구간은 END로 끝내세요. "
                "구간 시간대가 서로 겹치지 않도록 하세요."
            )

        system_prompt = (
            "역할: Viral Structure Analyst. 입력된 영상 자막을 분석해 바이럴 구조만 추출합니다. "
            "모든 설명과 값은 한국어로 작성하세요. 고유명사나 구체 사례는 최대한 일반화합니다. "
            f"{duration_msg} "
            "반드시 JSON만 출력하고 Markdown 코드블록을 붙이지 마세요. "
            "스키마: {"
            "\"viral_score\": 0~100 숫자(후킹 강도, 흐름 일관성, 심리 트리거, CTA 명확성 기준), "
            "\"score_reason\": '점수에 대한 근거 1~2문장', "
            "\"keywords\": ['#키워드1', '#키워드2', ... 최대 6개], "
            "\"one_line_summary\": '한 줄 요약', "
            "\"score_breakdown\": [{\"name\": \"후킹\", \"score\": 0~100}, {\"name\": \"전환\", \"score\": 0~100}, {\"name\": \"감정\", \"score\": 0~100}, {\"name\": \"CTA\", \"score\": 0~100}], "
            "\"timeline\": ["
            "{"
            "\"time\": '00:00-00:05', "
            "\"phase\": 'HOOK/BODY/CTA 등', "
            "\"formula\": '문장 패턴/심리 트리거를 설명', "
            "\"intent\": '심리적 의도(예: 주목, 공감, 권위, 실행 촉구 등)'"
            "}"
            "]"
            "}"
        )

        response = None
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=transcript_text,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    temperature=0.2,
                    top_p=0.8,
                    top_k=40,
                    max_output_tokens=8192,
                )
                )
                break
            except Exception as e:
                msg = str(e).upper()
                if attempt < 2 and ("503" in msg or "UNAVAILABLE" in msg or "OVERLOADED" in msg):
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise

        try:
            return json.loads(response.text)
        except json.JSONDecodeError:
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            return json.loads(text.strip())

    except Exception as e:
        print(f"Error in analyze_structure: {e}")
        return {"error": str(e)}


def generate_script(structure_json, user_topic, tone=None, style=None, audience=None):
    """
    Generate new script based on structure and topic.
    """
    try:
        client = get_client()

        tone_map = {
            "serious": "톤: 차분하고 신뢰감을 주는 진지한 어조",
            "humor": "톤: 가볍게 유머를 섞되 과하지 않게",
            "emotional": "톤: 감동과 공감을 주는 서정적인 어조",
            "sharp": "톤: 직설적이고 팩트 폭격처럼 날카로운 어조",
            "default": "톤: 원본과 유사한 중립 어조"
        }
        tone_line = tone_map.get(tone or "default", tone_map["default"])
        style_line = f"스타일: {style}" if style else "스타일: 기본"
        audience_line = f"타깃 시청자: {audience}" if audience else "타깃 시청자: 일반"
        system_prompt = (
            "당신은 유튜브 벤치마킹 전문 스크립트 작가입니다.\n"
            "사용자가 제공한 [영상 구조 분석 데이터]의 '구조(흐름, 타이밍, 의도)'만 차용하고, "
            "내용은 반드시 사용자가 입력한 [주제]로 새롭게 창작해야 합니다.\n"
            "절대로 원본 영상의 내용이나 키워드를 섞어 쓰지 마세요.\n\n"
            f"[타겟 독자]: {audience_line}\n"
            f"[톤앤매너]: {tone_line}\n"
            f"[스타일]: {style_line}\n\n"
            "[필수: 작성 원칙]\n"
            "1. **주제 절대 준수**:\n"
            "   - 입력된 [주제]에 대해서만 이야기하세요. 구조 데이터에 있는 원본 영상의 소재(예: 다이어트, 주식 등)가 [주제]와 다르면 절대 언급하지 마세요.\n"
            "2. **타임스탬프 그룹핑(Grouping)**:\n"
            "   - 5초~10초 간격 내의 짧은 문장 파편들은 반드시 하나의 문단으로 합쳐서 작성하세요.\n"
            "   - 절대 같은 시간대(예: [00:00])를 여러 번 줄바꿈하여 반복하지 마세요.\n"
            "3. **자연스러운 구어체**:\n"
            "   - 딱딱한 번역투나 설명조를 피하고, 유튜버가 실제로 말하는 듯한 자연스러운 연결어미를 사용하세요.\n"
            "   - \"자, 그럼 시작해볼까요?\" 처럼 독자에게 말을 걸듯이 작성하세요.\n"
            "4. **형식 준수**:\n"
            "   - 오직 스크립트 본문만 작성하세요. (서론, 결론 멘트 금지)\n"
            "   - 타임스탬프 포맷 `[분:초]`를 유지하세요.\n"
        )

        user_message = (
            f"주제: {user_topic}\n"
            f"구조 데이터: {json.dumps(structure_json, ensure_ascii=False)}\n"
        )

        response = None
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=user_message,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        temperature=0.3,
                        top_p=0.8,
                        top_k=40,
                        max_output_tokens=3000,
                    )
                )
                break
            except Exception as e:
                msg = str(e).upper()
                if attempt < 2 and ("503" in msg or "UNAVAILABLE" in msg or "OVERLOADED" in msg):
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise

        return response.text

    except Exception as e:
        print(f"Error in generate_script: {e}")
        return f"Error generating script: {e}"


def generate_titles(structure_json, user_topic):
    """
    Generate 3 hooky YouTube titles based on structure and topic.
    """
    try:
        client = get_client()

        system_prompt = (
            "Role: Viral YouTube Title Hook Generator. "
            "출력: 한국어 제목 3개, 각 18~32자, 한 줄. "
            "구성: 하나의 강한 훅(의사 경고/반전/궁금증/숫자·기간/1스푼·1분 등) + 짧은 결과. "
            "금지: 해시태그, 긴 설명/배경, 말줄임표(...), 두 문장, 마침표, 괄호/인용부호 남발, 번호/불릿/이모지. "
            "예시: '[의사 경고] 라면 7일, 혈당 폭증', '이거 몰랐지? 라면 한 숟가락이 바꾼 혈당', '라면 끊지 말고 혈당 잠그는 1스푼'. "
            "형식: JSON {\"titles\": [\"t1\",\"t2\",\"t3\"]}. JSON 외 다른 텍스트/마크다운 금지."
        )

        user_message = f"User Topic: {user_topic}\n\nViral Structure JSON:\n{json.dumps(structure_json, ensure_ascii=False)}"

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                temperature=0.2,
                top_p=0.9
            )
        )

        try:
            return json.loads(response.text)
        except json.JSONDecodeError:
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            return json.loads(text.strip())

    except Exception as e:
        print(f"Error in generate_titles: {e}")
        return {"titles": []}
