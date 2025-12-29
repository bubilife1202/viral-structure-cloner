// 세션 ID 생성 및 heartbeat
const SESSION_ID = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();

function sendHeartbeat() {
  fetch('/api/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION_ID })
  }).catch(() => {});
}

// 페이지 로드 시 즉시 heartbeat, 이후 10초마다
sendHeartbeat();
setInterval(sendHeartbeat, 10000);

// 페이지 떠날 때 알림 (선택적)
window.addEventListener('beforeunload', () => {
  navigator.sendBeacon('/api/heartbeat', JSON.stringify({ session_id: SESSION_ID + '_leave' }));
});

// 개발자 도구 차단
(function() {
  // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U 차단
  document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u'))) {
      e.preventDefault();
      return false;
    }
  });

  // 우클릭 차단
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  });
})();

const state = {
  analysis: null,
  originalTimeline: null,
  topic: "",
  tone: "default",
  style: "default",
  audience: "",
  scripts: [],
  activeScriptId: null,
  scriptTheme: "light",
};

// DOM Elements
const el = (id) => document.getElementById(id);

// Utilities
const setStatus = (id, msg = "") => {
  const node = el(id);
  if (node) node.innerText = msg;
};

const showToast = (message, actionText = null, onAction = null) => {
  const toast = el("toast");
  const msg = el("toastMsg");
  const actionBtn = el("toastAction");

  if (!toast || !msg) return;

  msg.innerText = message;

  if (actionText && onAction) {
    actionBtn.innerText = actionText;
    actionBtn.onclick = () => {
      onAction();
      toast.classList.remove("show");
    };
    actionBtn.style.display = "block";
  } else {
    actionBtn.style.display = "none";
  }

  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 4000);
};

// API Helper
async function postJSON(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = await res.text();
      try {
        const j = JSON.parse(detail);
        detail = j.detail || detail;
      } catch (_) { }
      throw new Error(detail || res.statusText);
    }
    return res.json();
  } catch (error) {
    throw error;
  }
}

// Progress Steps Animation
let progressTimers = [];
let loadingTimers = [];

const clearProgressTimers = () => {
  progressTimers.forEach(t => clearTimeout(t));
  progressTimers = [];
};

const clearLoadingTimers = () => {
  loadingTimers.forEach(t => clearTimeout(t));
  loadingTimers = [];
};

// Loading Overlay with time-based messages
// Whisper 음성인식 사용 시 30초~2분 소요될 수 있음
const loadingMessages = [
  { delay: 0, title: "영상 분석 중...", subtitle: "영상 구조를 파악하고 있어요" },
  { delay: 3000, title: "자막 추출 중...", subtitle: "AI가 대본을 읽고 있어요" },
  { delay: 6000, title: "패턴 분석 중...", subtitle: "바이럴 구조를 분석하고 있어요" },
  { delay: 12000, title: "조금만 기다려주세요", subtitle: "분석 마무리 중이에요", showTip: true, tip: "거의 다 됐어요!" },
  { delay: 20000, title: "음성 인식 중...", subtitle: "자막이 없어서 AI가 음성을 분석해요", showTip: true, tip: "자막 없는 영상은 시간이 조금 더 걸려요" },
  { delay: 35000, title: "열심히 듣고 있어요", subtitle: "음성을 텍스트로 변환 중", showTip: true, tip: "30초~1분 정도 소요돼요" },
  { delay: 50000, title: "거의 완료!", subtitle: "마지막 처리 중이에요", showTip: true, tip: "조금만 더 기다려주세요~" },
  { delay: 70000, title: "복잡한 영상이네요", subtitle: "음성 분석에 시간이 걸리고 있어요", showTip: true, tip: "긴 영상은 시간이 더 필요해요" },
  { delay: 90000, title: "곧 끝나요!", subtitle: "결과를 정리하고 있어요", showTip: true, tip: "잠시만요!" }
];

const showLoadingOverlay = () => {
  clearLoadingTimers();

  const overlay = el("loadingOverlay");
  const title = el("loadingTitle");
  const subtitle = el("loadingSubtitle");
  const tips = el("loadingTips");
  const tipText = el("loadingTipText");

  if (!overlay) return;

  // Reset to initial state
  title.innerText = loadingMessages[0].title;
  subtitle.innerText = loadingMessages[0].subtitle;
  tips.classList.add("hidden");

  overlay.classList.remove("hidden");

  // Set up timed message changes
  loadingMessages.forEach((msg, idx) => {
    if (idx === 0) return; // Skip first, already shown

    loadingTimers.push(setTimeout(() => {
      title.innerText = msg.title;
      subtitle.innerText = msg.subtitle;

      if (msg.showTip) {
        tipText.innerText = msg.tip;
        tips.classList.remove("hidden");
      }
    }, msg.delay));
  });
};

const hideLoadingOverlay = () => {
  clearLoadingTimers();
  const overlay = el("loadingOverlay");
  if (overlay) overlay.classList.add("hidden");
};

const updateProgress = (step) => {
  const container = el("analyzeProgress");
  if (!container) return;

  container.classList.remove("hidden");

  const steps = container.querySelectorAll(".progress-step");
  steps.forEach((stepEl, idx) => {
    stepEl.classList.remove("active", "completed");
    if (idx + 1 < step) {
      stepEl.classList.add("completed");
      stepEl.querySelector(".progress-icon").innerText = "✓";
    } else if (idx + 1 === step) {
      stepEl.classList.add("active");
    }
  });
};

const hideProgress = () => {
  clearProgressTimers();
  const container = el("analyzeProgress");
  if (container) {
    container.classList.add("hidden");
    // Reset all steps
    const steps = container.querySelectorAll(".progress-step");
    steps.forEach((stepEl, idx) => {
      stepEl.classList.remove("active", "completed");
      stepEl.querySelector(".progress-icon").innerText = (idx + 1).toString();
    });
  }
};

// Score Gauge Animation
const updateScoreGauge = (score) => {
  const gauge = el("scoreGauge");
  const scoreValue = el("scoreValue");
  const scoreGrade = el("scoreGrade");

  if (!gauge || !scoreValue) return;

  const circumference = 2 * Math.PI * 54; // 339.292
  const offset = circumference - (score / 100) * circumference;

  gauge.style.strokeDashoffset = offset;

  // Color based on score
  if (score >= 80) {
    gauge.style.stroke = "var(--success)";
    scoreGrade.innerText = "EXCELLENT";
    scoreGrade.style.background = "var(--success-bg)";
    scoreGrade.style.color = "var(--success)";
  } else if (score >= 60) {
    gauge.style.stroke = "var(--primary)";
    scoreGrade.innerText = "GOOD";
    scoreGrade.style.background = "var(--primary-light)";
    scoreGrade.style.color = "var(--primary)";
  } else if (score >= 40) {
    gauge.style.stroke = "var(--warning)";
    scoreGrade.innerText = "AVERAGE";
    scoreGrade.style.background = "var(--warning-bg)";
    scoreGrade.style.color = "var(--warning)";
  } else {
    gauge.style.stroke = "var(--error)";
    scoreGrade.innerText = "NEEDS WORK";
    scoreGrade.style.background = "var(--error-bg)";
    scoreGrade.style.color = "var(--error)";
  }

  // Animate number
  let current = 0;
  const duration = 1000;
  const step = score / (duration / 16);

  const animate = () => {
    current += step;
    if (current >= score) {
      scoreValue.innerText = score;
    } else {
      scoreValue.innerText = Math.round(current);
      requestAnimationFrame(animate);
    }
  };
  animate();
};

// Update Score Breakdown
const updateScoreBreakdown = (data) => {
  // Generate random-ish scores based on viral_score if not provided
  const baseScore = data.viral_score || 50;
  const scores = {
    hook: data.hook_score || Math.min(100, Math.max(0, baseScore + Math.floor(Math.random() * 20 - 10))),
    flow: data.flow_score || Math.min(100, Math.max(0, baseScore + Math.floor(Math.random() * 20 - 10))),
    trigger: data.trigger_score || Math.min(100, Math.max(0, baseScore + Math.floor(Math.random() * 20 - 10))),
    cta: data.cta_score || Math.min(100, Math.max(0, baseScore + Math.floor(Math.random() * 20 - 10))),
  };

  el("hookScore").innerText = scores.hook;
  el("flowScore").innerText = scores.flow;
  el("triggerScore").innerText = scores.trigger;
  el("ctaScore").innerText = scores.cta;

  el("hookBar").style.width = `${scores.hook}%`;
  el("flowBar").style.width = `${scores.flow}%`;
  el("triggerBar").style.width = `${scores.trigger}%`;
  el("ctaBar").style.width = `${scores.cta}%`;
};

// Logic
const updateGenerateButton = () => {
  const topicFilled = (el("topic")?.value.trim().length || 0) > 0;
  const hasAnalysis = !!state.analysis;
  const btn = el("generate");
  const step2Status = el("step2Status");
  const stepBadge = el("step2Panel")?.querySelector(".step-badge");

  if (btn) {
    btn.disabled = !(hasAnalysis && topicFilled);
  }

  if (step2Status) {
    if (!hasAnalysis) {
      step2Status.innerText = "Step 1을 먼저 완료하세요";
    } else if (!topicFilled) {
      step2Status.innerText = "주제를 입력하세요";
    } else {
      step2Status.innerText = "준비 완료!";
      step2Status.style.color = "var(--success)";
    }
  }

  if (stepBadge && hasAnalysis) {
    stepBadge.classList.remove("secondary");
  }
};

// Render Timeline Visual Bar
const renderTimelineBar = (items) => {
  const bar = el("timelineBar");
  if (!bar || !items || items.length === 0) return;

  bar.innerHTML = "";

  // Calculate total duration
  const parseTime = (timeStr) => {
    const parts = timeStr.split(":").map(Number);
    return parts[0] * 60 + parts[1];
  };

  let totalDuration = 0;
  items.forEach(item => {
    const time = parseTime(item.time || "00:00");
    if (time > totalDuration) totalDuration = time;
  });
  totalDuration = totalDuration || 600; // Default 10 min

  items.forEach((item, idx) => {
    const phase = (item.phase || "").toLowerCase();
    const phaseClass = phase.includes("hook") ? "hook" : phase.includes("cta") ? "cta" : "body";

    const startTime = parseTime(item.time || "00:00");
    const nextTime = items[idx + 1] ? parseTime(items[idx + 1].time) : totalDuration;
    const duration = nextTime - startTime;
    const widthPercent = (duration / totalDuration) * 100;

    const segment = document.createElement("div");
    segment.className = `timeline-segment ${phaseClass}`;
    segment.style.width = `${widthPercent}%`;
    segment.innerText = item.phase || "PHASE";
    segment.title = `${item.time} - ${item.phase}`;
    bar.appendChild(segment);
  });
};

const renderTimeline = (items) => {
  const container = el("timeline");
  if (!container) return;

  container.innerHTML = "";

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📹</span>
        <p>영상을 분석하면 구조가 여기에 표시됩니다.</p>
      </div>`;
    return;
  }

  renderTimelineBar(items);

  items.forEach((item, idx) => {
    const phase = (item.phase || "").toLowerCase();
    const phaseClass = phase.includes("hook") ? "hook" : phase.includes("cta") ? "cta" : "body";
    const intents = (item.intent || "").split(",").map(s => s.trim()).filter(Boolean);
    const tagsHtml = intents.map(t => `<span class="intent-tag">#${t}</span>`).join("");

    const div = document.createElement("div");
    div.className = `timeline-item ${phaseClass}`;
    div.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-meta">
          <span class="time-tag ${phaseClass}">${item.time || "00:00"}</span>
          <span class="phase-label">${item.phase || "Phase"}</span>
        </div>
        <div class="timeline-actions">
          <button class="ghost btn-small" data-action="edit" data-index="${idx}" title="수정">✏️</button>
          <button class="ghost btn-small" data-action="remove" data-index="${idx}" title="삭제" style="color:var(--error);">🗑️</button>
        </div>
      </div>
      <div class="timeline-content">
        <p class="timeline-formula">${item.formula || ""}</p>
      </div>
      <div class="timeline-tags">${tagsHtml}</div>
    `;
    container.appendChild(div);
  });
};

let editingPatternIndex = null;

const editPattern = (idx) => {
  if (!state.analysis?.timeline || !state.analysis.timeline[idx]) return;
  const current = state.analysis.timeline[idx];

  editingPatternIndex = idx;
  el("editFormula").value = current.formula || "";
  el("editIntent").value = current.intent || "";

  el("editPatternModal").classList.add("show");
};

const saveEditedPattern = () => {
  if (editingPatternIndex === null) return;

  const formula = el("editFormula").value.trim();
  const intent = el("editIntent").value.trim();

  if (!formula) return showToast("패턴 설명을 입력해주세요.");

  state.analysis.timeline[editingPatternIndex].formula = formula;
  state.analysis.timeline[editingPatternIndex].intent = intent;

  renderTimeline(state.analysis.timeline);
  el("editPatternModal").classList.remove("show");
  editingPatternIndex = null;
  showToast("패턴이 수정되었습니다.");
};

const removePattern = (idx) => {
  if (!state.analysis?.timeline || !state.analysis.timeline[idx]) return;
  const removed = state.analysis.timeline.splice(idx, 1)[0];
  renderTimeline(state.analysis.timeline);

  showToast("패턴이 삭제되었습니다.", "실행 취소", () => {
    state.analysis.timeline.splice(idx, 0, removed);
    renderTimeline(state.analysis.timeline);
  });
};

const renderBlueprint = (data) => {
  state.analysis = data;
  if (!state.originalTimeline) state.originalTimeline = JSON.parse(JSON.stringify(data.timeline || []));

  // Update Summary Card
  el("summary").innerText = data.one_line_summary || "-";

  // Update Score
  const score = Math.max(0, Math.min(Number(data.viral_score || 0), 100));
  updateScoreGauge(score);
  updateScoreBreakdown(data);

  // Update Insight
  el("scoreReason").innerText = data.score_reason || "분석 데이터를 기반으로 한 AI 인사이트입니다.";

  // Update Keywords
  const kwContainer = el("keywords");
  kwContainer.innerHTML = "";
  (data.keywords || []).forEach(k => {
    const span = document.createElement("span");
    span.className = "keyword-tag";
    span.innerText = k;
    kwContainer.appendChild(span);
  });

  // Update Step 1 status
  const step1Badge = document.querySelector(".step-panel .step-badge");
  if (step1Badge) {
    step1Badge.classList.add("completed");
    step1Badge.innerText = "✓ 완료";
  }
  setStatus("step1Status", "분석 완료!");

  renderTimeline(data.timeline || []);
  updateGenerateButton();

  // 분석 완료 후 STEP 2로 스크롤 및 하이라이트
  setTimeout(() => {
    const step2Panel = el("step2Panel");
    const topicInput = el("topic");

    if (step2Panel) {
      // 스크롤
      step2Panel.scrollIntoView({ behavior: "smooth", block: "center" });

      // 하이라이트 효과
      step2Panel.classList.add("highlight-pulse");
      setTimeout(() => step2Panel.classList.remove("highlight-pulse"), 2000);

      // 입력란 포커스
      setTimeout(() => {
        if (topicInput) topicInput.focus();
      }, 800);
    }
  }, 500);
};

const renderScriptTabs = () => {
  const container = el("scriptTabs");
  const newVersionBtn = el("newVersionBtn");
  if (!container) return;
  container.innerHTML = "";

  state.scripts.forEach(s => {
    const btn = document.createElement("button");
    btn.className = `script-tab ${state.activeScriptId === s.id ? "active" : ""}`;
    btn.innerText = s.id;
    btn.onclick = () => {
      state.activeScriptId = s.id;
      renderScriptContent(s.text);
      renderScriptTabs();
    };
    container.appendChild(btn);
  });

  if (state.scripts.length > 0 && newVersionBtn) {
    newVersionBtn.classList.remove("hidden");
  }
};

const renderScriptContent = (text) => {
  const content = el("scriptContent");
  const box = el("scriptBox");
  const actions = el("scriptActions");

  if (!content || !box) return;

  if (!text) {
    content.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✨</span>
        <p>스크립트가 생성되면 여기에 표시됩니다.</p>
      </div>`;
    box.classList.add("hidden");
    if (actions) actions.classList.add("hidden");
    return;
  }

  content.classList.add("hidden");
  box.classList.remove("hidden");
  if (actions) actions.classList.remove("hidden");

  // Parse and format script with sections
  const escapeHTML = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let safe = escapeHTML(text || "").replace(/\n\n+/g, "\n\n");

  // Highlight timestamps
  safe = safe.replace(/\[(\d{2}:\d{2}[^\]]*?)\]/g, '<span style="color:var(--warning); font-weight:bold;">⏱ $1</span>');

  // Highlight section headers
  safe = safe.replace(/\[HOOK\]/gi, '<span style="color:var(--hook-color); font-weight:bold;">🎣 [HOOK]</span>');
  safe = safe.replace(/\[BODY\]/gi, '<span style="color:var(--body-color); font-weight:bold;">📖 [BODY]</span>');
  safe = safe.replace(/\[CTA\]/gi, '<span style="color:var(--cta-color); font-weight:bold;">📢 [CTA]</span>');

  box.innerHTML = safe.split("\n").join("<br>");
};

// Download Script
const downloadScript = () => {
  const script = state.scripts.find(s => s.id === state.activeScriptId);
  if (!script) return showToast("다운로드할 스크립트가 없습니다.");

  const blob = new Blob([script.text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `script_${state.activeScriptId.replace(/\s/g, "_")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("스크립트가 다운로드되었습니다.");
};

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Theme Toggle with localStorage
  const loadTheme = () => {
    const savedTheme = localStorage.getItem("vc_theme");
    if (savedTheme === "dark") {
      document.body.classList.add("dark");
      el("themeToggle").innerText = "☀️";
    } else {
      document.body.classList.remove("dark");
      el("themeToggle").innerText = "🌙";
    }
  };

  loadTheme();

  el("themeToggle").onclick = () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    el("themeToggle").innerText = isDark ? "☀️" : "🌙";
    localStorage.setItem("vc_theme", isDark ? "dark" : "light");
  };

  // YouTube Thumbnail Preview
  function extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function showThumbnailPreview(videoId) {
    const preview = el("videoPreview");
    const thumbnail = el("videoThumbnail");
    if (!preview || !thumbnail) return;

    thumbnail.src = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    thumbnail.onerror = () => {
      thumbnail.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    };
    preview.classList.remove("hidden");
  }

  function hideThumbnailPreview() {
    const preview = el("videoPreview");
    if (preview) preview.classList.add("hidden");
  }

  const urlInput = el("urlInput");
  if (urlInput) {
    urlInput.addEventListener("input", () => {
      const url = urlInput.value.trim();
      const videoId = extractVideoId(url);
      if (videoId) {
        showThumbnailPreview(videoId);
      } else {
        hideThumbnailPreview();
      }
    });

    urlInput.addEventListener("paste", () => {
      setTimeout(() => {
        const url = urlInput.value.trim();
        const videoId = extractVideoId(url);
        if (videoId) {
          showThumbnailPreview(videoId);
        }
      }, 0);
    });
  }

  const clearUrlBtn = el("clearUrl");
  if (clearUrlBtn) {
    clearUrlBtn.onclick = () => {
      if (urlInput) urlInput.value = "";
      hideThumbnailPreview();
      urlInput.focus();
    };
  }

  // Settings Modal
  window.openSettingsModal = () => {
    el("settingsModal").classList.add("show");
  };

  window.closeSettingsModal = () => {
    el("settingsModal").classList.remove("show");
  };

  // Edit Pattern Modal
  window.closeEditPatternModal = () => {
    el("editPatternModal").classList.remove("show");
  };

  el("savePatternBtn").onclick = saveEditedPattern;

  // Admin Key Modal
  let isAdminMode = false;

  window.openAdminKeyModal = () => {
    el("adminKeyModal").classList.add("show");
    el("adminKeyInput").value = "";
    el("adminKeyStatus").innerText = "";
    el("adminKeyInput").focus();
  };

  window.closeAdminKeyModal = () => {
    el("adminKeyModal").classList.remove("show");
  };

  const checkAdminStatus = async () => {
    try {
      const res = await fetch("/api/check-admin");
      const data = await res.json();
      isAdminMode = data.is_admin;
      updateAdminUI();
    } catch (e) {
      console.log("Admin check failed:", e);
    }
  };

  const updateAdminUI = () => {
    const adminBtn = el("adminKeyBtn");
    const selectionHint = document.querySelector(".selection-hint");

    if (isAdminMode) {
      adminBtn.innerText = "✅";
      adminBtn.title = "무제한 사용 활성화됨";
      if (selectionHint) {
        selectionHint.innerText = "✅ 무제한 사용 활성화됨";
        selectionHint.style.color = "var(--success)";
      }
    } else {
      adminBtn.innerText = "🔑";
      adminBtn.title = "관리자 키 입력";
    }
  };

  const activateAdmin = async () => {
    const key = el("adminKeyInput").value.trim();
    const statusEl = el("adminKeyStatus");

    if (!key) {
      statusEl.innerText = "키를 입력해주세요.";
      statusEl.style.color = "var(--error)";
      return;
    }

    try {
      const res = await fetch("/api/activate-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });

      if (res.ok) {
        const data = await res.json();
        isAdminMode = true;
        updateAdminUI();
        statusEl.innerText = data.message;
        statusEl.style.color = "var(--success)";
        showToast("🎉 무제한 사용이 활성화되었습니다!");
        setTimeout(closeAdminKeyModal, 1500);
      } else {
        const err = await res.json();
        statusEl.innerText = err.detail || "잘못된 키입니다.";
        statusEl.style.color = "var(--error)";
      }
    } catch (e) {
      statusEl.innerText = "오류가 발생했습니다.";
      statusEl.style.color = "var(--error)";
    }
  };

  el("adminKeyBtn").onclick = openAdminKeyModal;
  el("activateAdminBtn").onclick = activateAdmin;
  el("adminKeyInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") activateAdmin();
  });

  // Check admin status on page load
  checkAdminStatus();

  // Analyze
  el("analyzeBtn").onclick = async () => {
    const url = el("urlInput").value.trim();
    if (!url) return showToast("URL을 입력해주세요.");

    const btn = el("analyzeBtn");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> 분석 중...`;

    // Show loading overlay
    showLoadingOverlay();

    try {
      const data = await postJSON("/api/analyze", { url });
      renderBlueprint(data);
      showToast("분석이 완료되었습니다! 🎉");
    } catch (e) {
      showToast(`분석 실패: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
      hideLoadingOverlay();
    }
  };

  // Generate
  el("generate").onclick = async () => {
    if (!state.analysis) return;
    const topic = el("topic").value.trim();
    if (!topic) return showToast("주제를 입력해주세요.");

    const btn = el("generate");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> 생성 중...`;

    try {
      const res = await postJSON("/api/generate", {
        topic,
        analysis: state.analysis,
        tone: el("tone").value,
        style: el("style").value,
        audience: el("audience").value
      });

      const id = `Ver ${state.scripts.length + 1}`;
      state.scripts.push({ id, text: res.script });
      state.activeScriptId = id;

      renderScriptTabs();
      renderScriptContent(res.script);
      showToast("스크립트가 생성되었습니다! ✨");
    } catch (e) {
      showToast(`생성 실패: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  };

  // Inputs
  el("topic").addEventListener("input", updateGenerateButton);

  // Copy
  el("copyScript").onclick = async () => {
    const text = el("scriptBox").innerText;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast("클립보드에 복사되었습니다! 📋");
    } catch (e) {
      showToast("복사 실패");
    }
  };

  // Download
  el("downloadScript").onclick = downloadScript;

  // Regenerate
  el("regenerateScript").onclick = () => {
    el("generate").click();
  };

  // New Version Button
  el("newVersionBtn").onclick = () => {
    el("generate").click();
  };

  // Script Editing Sync
  el("scriptBox").addEventListener("input", () => {
    if (state.activeScriptId) {
      const script = state.scripts.find(s => s.id === state.activeScriptId);
      if (script) {
        script.text = el("scriptBox").innerText;
      }
    }
  });

  // Reset Pattern
  el("resetPattern").onclick = () => {
    if (state.originalTimeline) {
      state.analysis.timeline = JSON.parse(JSON.stringify(state.originalTimeline));
      renderTimeline(state.analysis.timeline);
      showToast("패턴이 초기화되었습니다.");
    }
  };

  // Timeline Event Delegation
  el("timeline").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const index = Number(btn.dataset.index);

    if (action === "edit") {
      editPattern(index);
    }
    if (action === "remove") {
      removePattern(index);
    }
  });

  // ========================================
  // 메인 선택 카드 동작
  // ========================================
  const selectionSection = document.querySelector('.selection-section');
  const mainWorkspace = el('mainWorkspace');
  const templateWorkspace = el('templateWorkspace');

  // ========================================
  // History API - 브라우저 뒤로가기 지원
  // ========================================
  const navigateTo = (page, subPage = null, addToHistory = true) => {
    // 모든 워크스페이스 숨기기
    if (selectionSection) selectionSection.classList.add('hidden');
    if (mainWorkspace) mainWorkspace.classList.add('hidden');
    if (templateWorkspace) templateWorkspace.classList.add('hidden');
    const exploreWs = el('exploreWorkspace');
    if (exploreWs) exploreWs.classList.add('hidden');

    // 해당 페이지 표시
    switch (page) {
      case 'selection':
        if (selectionSection) selectionSection.classList.remove('hidden');
        break;
      case 'analyze':
        if (mainWorkspace) mainWorkspace.classList.remove('hidden');
        break;
      case 'template':
        if (templateWorkspace) templateWorkspace.classList.remove('hidden');
        renderCategoryGridPage();
        if (subPage === 'category') {
          resetTemplateSteps();
        }
        break;
      case 'explore':
        if (exploreWs) exploreWs.classList.remove('hidden');
        if (subPage === 'category') {
          renderExploreCategoryGrid();
          resetExploreSteps();
        } else if (subPage === 'videos') {
          // 영상 목록은 이미 표시된 상태 유지
        }
        break;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // History에 추가
    if (addToHistory) {
      const state = { page, subPage };
      history.pushState(state, '', `#${page}${subPage ? '/' + subPage : ''}`);
    }
  };

  // 브라우저 뒤로가기/앞으로가기 처리
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.page) {
      // explore 페이지의 서브페이지 처리
      if (event.state.page === 'explore') {
        if (event.state.subPage === 'category') {
          // 카테고리 선택 화면으로
          navigateTo('explore', 'category', false);
          if (window._showExploreCategoryStep) {
            window._showExploreCategoryStep();
          }
        } else if (event.state.subPage === 'videos') {
          // 영상 목록 (이미 로드된 상태 유지)
          navigateTo('explore', 'videos', false);
        }
      } else {
        navigateTo(event.state.page, event.state.subPage, false);
      }
    } else {
      // 초기 상태 (히스토리 없음) -> 선택 화면
      navigateTo('selection', null, false);
    }
  });

  // 초기 히스토리 상태 설정
  history.replaceState({ page: 'selection' }, '', '#selection');

  const showWorkspace = () => {
    navigateTo('analyze');
  };

  const showTemplateWorkspace = () => {
    navigateTo('template', 'category');
  };

  const showSelection = () => {
    navigateTo('selection');
  };

  // Card 1: URL 분석
  const selectUrlAnalysis = el('selectUrlAnalysis');
  if (selectUrlAnalysis) {
    selectUrlAnalysis.onclick = () => {
      showWorkspace();
      setTimeout(() => {
        const urlInput = el('urlInput');
        if (urlInput) urlInput.focus();
      }, 300);
    };
  }

  // Card 2: 빠른 시작 (템플릿)
  const selectQuickStart = el('selectQuickStart');
  if (selectQuickStart) {
    selectQuickStart.onclick = () => {
      showTemplateWorkspace();
    };
  }

  // Card 3: 인기 영상 탐색
  const selectExplore = el('selectExplore');
  const exploreWorkspace = el('exploreWorkspace');

  const showExploreWorkspace = () => {
    navigateTo('explore', 'category');
  };

  if (selectExplore) {
    selectExplore.classList.remove('disabled');
    selectExplore.onclick = () => {
      showExploreWorkspace();
    };
  }

  // 뒤로가기 버튼
  const backToSelectionBtn = el('backToSelectionBtn');
  if (backToSelectionBtn) {
    backToSelectionBtn.onclick = showSelection;
  }

  // 템플릿 페이지 뒤로가기
  const backFromTemplate = el('backFromTemplate');
  if (backFromTemplate) {
    backFromTemplate.onclick = showSelection;
  }

  // ========================================
  // 템플릿 페이지 (바로 시작) 기능
  // ========================================

  // 페이지 상태
  let pageSelectedCategory = null;
  let pageSelectedTemplate = null;

  // 카테고리 그리드 렌더링 (페이지 버전)
  const renderCategoryGridPage = () => {
    const grid = el("categoryGridPage");
    if (!grid) return;

    grid.innerHTML = CATEGORIES.map(cat => `
      <div class="category-card-page" data-cat-id="${cat.id}">
        <span class="cat-icon-large">${cat.icon}</span>
        <span class="cat-name">${cat.name}</span>
      </div>
    `).join("");

    // 클릭 이벤트
    grid.querySelectorAll(".category-card-page").forEach(item => {
      item.onclick = () => {
        pageSelectedCategory = CATEGORIES.find(c => c.id === item.dataset.catId);
        showTemplateStepPage();
      };
    });
  };

  // 템플릿 그리드 렌더링 (페이지 버전)
  const renderTemplateGridPage = () => {
    const grid = el("templateGridPage");
    if (!grid) return;

    const templates = TEMPLATES.common;
    grid.innerHTML = templates.map(tpl => `
      <div class="template-card-page" data-tpl-id="${tpl.id}">
        <div class="tpl-header-page">
          <span class="tpl-icon-large">${tpl.icon}</span>
          <span class="tpl-name">${tpl.name}</span>
        </div>
        <div class="tpl-structure">${tpl.structure}</div>
        <p class="tpl-desc">${tpl.desc}</p>
        <p class="tpl-example">${tpl.example}</p>
      </div>
    `).join("");

    // 클릭 이벤트
    grid.querySelectorAll(".template-card-page").forEach(item => {
      item.onclick = () => {
        pageSelectedTemplate = TEMPLATES.common.find(t => t.id === item.dataset.tplId);
        showTopicStepPage();
      };
    });
  };

  // Step 전환 함수들 (페이지 버전)
  const resetTemplateSteps = () => {
    pageSelectedCategory = null;
    pageSelectedTemplate = null;
    el("templateStep1").classList.remove("hidden");
    el("templateStep2").classList.add("hidden");
    el("templateStep3").classList.add("hidden");
    el("templateResult").classList.add("hidden");
    const topicInput = el("templateTopic");
    if (topicInput) topicInput.value = "";
  };

  const showTemplateStepPage = () => {
    el("templateStep1").classList.add("hidden");
    el("templateStep2").classList.remove("hidden");
    el("templateStep3").classList.add("hidden");
    renderTemplateGridPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showTopicStepPage = () => {
    el("templateStep1").classList.add("hidden");
    el("templateStep2").classList.add("hidden");
    el("templateStep3").classList.remove("hidden");

    // 선택 정보 표시
    el("selectedCategoryBadge").innerText = `${pageSelectedCategory.icon} ${pageSelectedCategory.name}`;
    el("selectedTemplateBadge").innerText = `${pageSelectedTemplate.icon} ${pageSelectedTemplate.name}`;

    // 입력란 포커스
    setTimeout(() => {
      const topicInput = el("templateTopic");
      if (topicInput) topicInput.focus();
    }, 300);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 뒤로가기 함수들 (전역)
  window.backToCategoriesPage = () => {
    pageSelectedCategory = null;
    el("templateStep1").classList.remove("hidden");
    el("templateStep2").classList.add("hidden");
    el("templateStep3").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.backToTemplatesPage = () => {
    pageSelectedTemplate = null;
    el("templateStep1").classList.add("hidden");
    el("templateStep2").classList.remove("hidden");
    el("templateStep3").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 템플릿 페이지에서 스크립트 생성
  const generateFromTemplatePageBtn = el("generateFromTemplatePage");
  if (generateFromTemplatePageBtn) {
    generateFromTemplatePageBtn.onclick = async () => {
      const topic = el("templateTopic").value.trim();
      if (!topic) return showToast("주제를 입력해주세요.");

      if (!pageSelectedCategory || !pageSelectedTemplate) {
        return showToast("카테고리와 구조를 선택해주세요.");
      }

      const btn = generateFromTemplatePageBtn;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div> 생성 중...`;

      try {
        // 템플릿 기반 분석 데이터 구성
        const templateAnalysis = {
          one_line_summary: `${pageSelectedCategory.name} 분야의 ${pageSelectedTemplate.name} 콘텐츠`,
          viral_score: 75,
          keywords: [pageSelectedCategory.name, topic],
          timeline: pageSelectedTemplate.timeline
        };

        // 스크립트 생성 API 호출
        const res = await postJSON("/api/generate", {
          topic,
          analysis: templateAnalysis,
          tone: "default",
          style: "default",
          audience: "",
          category: pageSelectedCategory.name,
          template: pageSelectedTemplate.name
        });

        // 결과 표시
        const resultSection = el("templateResult");
        const scriptBox = el("templateScriptBox");

        if (scriptBox) {
          // 스크립트 포맷팅
          const escapeHTML = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          let safe = escapeHTML(res.script || "").replace(/\n\n+/g, "\n\n");
          safe = safe.replace(/\[(\d{2}:\d{2}[^\]]*?)\]/g, '<span style="color:var(--warning); font-weight:bold;">⏱ $1</span>');
          safe = safe.replace(/\[HOOK\]/gi, '<span style="color:var(--hook-color); font-weight:bold;">🎣 [HOOK]</span>');
          safe = safe.replace(/\[BODY\]/gi, '<span style="color:var(--body-color); font-weight:bold;">📖 [BODY]</span>');
          safe = safe.replace(/\[CTA\]/gi, '<span style="color:var(--cta-color); font-weight:bold;">📢 [CTA]</span>');
          scriptBox.innerHTML = safe.split("\n").join("<br>");
        }

        if (resultSection) {
          resultSection.classList.remove("hidden");
          setTimeout(() => {
            resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        }

        showToast("스크립트가 생성되었습니다! ✨");

      } catch (e) {
        showToast(`생성 실패: ${e.message}`);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    };
  }

  // 템플릿 결과 복사
  const copyTemplateScriptBtn = el("copyTemplateScript");
  if (copyTemplateScriptBtn) {
    copyTemplateScriptBtn.onclick = async () => {
      const text = el("templateScriptBox").innerText;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast("클립보드에 복사되었습니다! 📋");
      } catch (e) {
        showToast("복사 실패");
      }
    };
  }

  // 템플릿 결과 다운로드
  const downloadTemplateScriptBtn = el("downloadTemplateScript");
  if (downloadTemplateScriptBtn) {
    downloadTemplateScriptBtn.onclick = () => {
      const text = el("templateScriptBox").innerText;
      if (!text) return showToast("다운로드할 스크립트가 없습니다.");

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `script_template.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("스크립트가 다운로드되었습니다.");
    };
  }

  // 템플릿 결과 다시 생성
  const regenerateTemplateScriptBtn = el("regenerateTemplateScript");
  if (regenerateTemplateScriptBtn) {
    regenerateTemplateScriptBtn.onclick = () => {
      generateFromTemplatePageBtn.click();
    };
  }

  // Initialize
  updateGenerateButton();

  // ========================================
  // 카테고리 기반 스크립트 생성
  // ========================================

  // 카테고리 데이터 (10개 통일)
  const CATEGORIES = [
    { id: "health", icon: "🏃", name: "건강/운동", query: "건강 쇼츠" },
    { id: "finance", icon: "💰", name: "재테크/투자", query: "재테크 쇼츠" },
    { id: "food", icon: "🍳", name: "요리/맛집", query: "요리 레시피 쇼츠" },
    { id: "tech", icon: "💻", name: "IT/테크", query: "IT 쇼츠" },
    { id: "selfdev", icon: "📚", name: "자기계발", query: "자기계발 쇼츠" },
    { id: "beauty", icon: "💄", name: "뷰티/화장품", query: "뷰티 쇼츠" },
    { id: "travel", icon: "✈️", name: "여행", query: "여행 쇼츠" },
    { id: "game", icon: "🎮", name: "게임", query: "게임 쇼츠" },
    { id: "pet", icon: "🐶", name: "반려동물", query: "반려동물 쇼츠" },
    { id: "humor", icon: "😂", name: "유머/예능", query: "유머 쇼츠" }
  ];

  // 구조 템플릿 데이터
  const TEMPLATES = {
    // 모든 카테고리 공통
    common: [
      {
        id: "problem-solution",
        icon: "🔧",
        name: "문제-해결 구조",
        structure: "[문제제기] → [공감] → [해결책] → [실행방법] → [CTA]",
        desc: "문제를 먼저 제시하고 해결책을 알려주는 가장 보편적인 구조",
        example: "\"이것만 알면 OO 해결됩니다\"",
        timeline: [
          { time: "00:00", phase: "HOOK", formula: "충격적인 문제 상황 제시", intent: "주의환기, 공감유도" },
          { time: "00:15", phase: "BODY", formula: "왜 이 문제가 생기는지 원인 분석", intent: "신뢰구축, 전문성" },
          { time: "00:45", phase: "BODY", formula: "구체적인 해결 방법 3가지", intent: "가치전달, 실용성" },
          { time: "01:30", phase: "CTA", formula: "지금 바로 적용해보세요 + 구독 유도", intent: "행동유도, 전환" }
        ]
      },
      {
        id: "listicle",
        icon: "📋",
        name: "리스트형 구조",
        structure: "[훅] → [#1] → [#2] → [#3] → [요약/CTA]",
        desc: "숫자로 정리된 팁이나 방법을 전달하는 구조",
        example: "\"OO하는 5가지 방법\"",
        timeline: [
          { time: "00:00", phase: "HOOK", formula: "\"이 5가지만 알면 OO 마스터\"", intent: "기대감, 구체성" },
          { time: "00:10", phase: "BODY", formula: "첫 번째 팁 (가장 쉬운 것)", intent: "진입장벽 낮춤" },
          { time: "00:30", phase: "BODY", formula: "두 번째, 세 번째 팁", intent: "가치 축적" },
          { time: "01:00", phase: "BODY", formula: "네 번째, 다섯 번째 (핵심)", intent: "클라이맥스" },
          { time: "01:30", phase: "CTA", formula: "요약 + 다음 영상 예고", intent: "정리, 전환유도" }
        ]
      },
      {
        id: "story",
        icon: "📖",
        name: "스토리텔링 구조",
        structure: "[상황설정] → [갈등/문제] → [전환점] → [해결] → [교훈]",
        desc: "이야기 형식으로 몰입감 있게 전달하는 구조",
        example: "\"제가 OO했던 경험담\"",
        timeline: [
          { time: "00:00", phase: "HOOK", formula: "결과 먼저 보여주기 (Before/After)", intent: "호기심, 결과증명" },
          { time: "00:15", phase: "BODY", formula: "예전 상황 설명 (공감 포인트)", intent: "동질감, 공감" },
          { time: "00:40", phase: "BODY", formula: "어떻게 바뀌게 되었는지", intent: "전환점, 희망" },
          { time: "01:10", phase: "BODY", formula: "구체적인 방법 공유", intent: "실용적 가치" },
          { time: "01:40", phase: "CTA", formula: "여러분도 할 수 있어요", intent: "동기부여, 행동촉구" }
        ]
      },
      {
        id: "myth-busting",
        icon: "❌",
        name: "오해 타파 구조",
        structure: "[잘못된 상식] → [왜 틀렸는지] → [진짜 정보] → [증거] → [CTA]",
        desc: "흔한 오해를 깨고 진실을 알려주는 구조",
        example: "\"OO하면 안 된다고? 다 거짓말입니다\"",
        timeline: [
          { time: "00:00", phase: "HOOK", formula: "\"다들 OO라고 하는데, 틀렸습니다\"", intent: "논쟁유발, 호기심" },
          { time: "00:15", phase: "BODY", formula: "왜 이런 오해가 생겼는지", intent: "배경설명" },
          { time: "00:35", phase: "BODY", formula: "실제 사실/데이터 제시", intent: "신뢰구축, 전문성" },
          { time: "01:00", phase: "BODY", formula: "올바른 방법 안내", intent: "실용적 대안" },
          { time: "01:25", phase: "CTA", formula: "더 많은 진실 알려드릴게요", intent: "후속영상 유도" }
        ]
      },
      {
        id: "comparison",
        icon: "⚖️",
        name: "비교 분석 구조",
        structure: "[비교대상 소개] → [기준 설명] → [항목별 비교] → [결론] → [추천]",
        desc: "두 가지 이상을 비교해서 선택을 도와주는 구조",
        example: "\"A vs B, 뭐가 더 좋을까?\"",
        timeline: [
          { time: "00:00", phase: "HOOK", formula: "\"A vs B, 결론부터 말씀드립니다\"", intent: "결론 예고, 호기심" },
          { time: "00:15", phase: "BODY", formula: "비교 기준 설명", intent: "공정성 확보" },
          { time: "00:35", phase: "BODY", formula: "각 항목별 비교 분석", intent: "정보 전달" },
          { time: "01:15", phase: "BODY", formula: "상황별 추천", intent: "맞춤형 조언" },
          { time: "01:35", phase: "CTA", formula: "댓글로 의견 나눠주세요", intent: "참여유도" }
        ]
      },
      {
        id: "tutorial",
        icon: "🎓",
        name: "튜토리얼 구조",
        structure: "[완성본 미리보기] → [준비물] → [단계별 설명] → [팁] → [마무리]",
        desc: "따라하기 쉽게 단계별로 알려주는 구조",
        example: "\"이대로만 따라하세요\"",
        timeline: [
          { time: "00:00", phase: "HOOK", formula: "완성된 결과물 먼저 보여주기", intent: "목표 제시, 동기부여" },
          { time: "00:15", phase: "BODY", formula: "필요한 준비물/사전지식", intent: "진입장벽 낮춤" },
          { time: "00:30", phase: "BODY", formula: "Step 1, 2, 3 순차 설명", intent: "따라하기 쉬움" },
          { time: "01:20", phase: "BODY", formula: "자주하는 실수 & 꿀팁", intent: "추가 가치" },
          { time: "01:40", phase: "CTA", formula: "다음 레벨 영상 예고", intent: "시리즈화" }
        ]
      }
    ]
  };

  // 카테고리 모달 상태
  let selectedCategory = null;
  let selectedTemplate = null;

  // 카테고리 그리드 렌더링
  const renderCategoryGrid = () => {
    const grid = el("categoryGrid");
    if (!grid) return;

    grid.innerHTML = CATEGORIES.map(cat => `
      <div class="category-item" data-cat-id="${cat.id}">
        <span class="cat-icon">${cat.icon}</span>
        <span class="cat-name">${cat.name}</span>
      </div>
    `).join("");

    // 클릭 이벤트
    grid.querySelectorAll(".category-item").forEach(item => {
      item.onclick = () => {
        selectedCategory = CATEGORIES.find(c => c.id === item.dataset.catId);
        showTemplateStep();
      };
    });
  };

  // 템플릿 그리드 렌더링
  const renderTemplateGrid = () => {
    const grid = el("templateGrid");
    if (!grid) return;

    const templates = TEMPLATES.common;
    grid.innerHTML = templates.map(tpl => `
      <div class="template-item" data-tpl-id="${tpl.id}">
        <div class="tpl-header">
          <span class="tpl-icon">${tpl.icon}</span>
          <span class="tpl-name">${tpl.name}</span>
        </div>
        <div class="tpl-structure">${tpl.structure}</div>
        <p class="tpl-desc">${tpl.desc}</p>
        <p class="tpl-example">${tpl.example}</p>
      </div>
    `).join("");

    // 클릭 이벤트
    grid.querySelectorAll(".template-item").forEach(item => {
      item.onclick = () => {
        selectedTemplate = TEMPLATES.common.find(t => t.id === item.dataset.tplId);
        showTopicStep();
      };
    });
  };

  // Step 전환 함수들
  const showCategoryStep = () => {
    el("categoryStep1").classList.remove("hidden");
    el("categoryStep2").classList.add("hidden");
    el("categoryStep3").classList.add("hidden");
  };

  const showTemplateStep = () => {
    el("categoryStep1").classList.add("hidden");
    el("categoryStep2").classList.remove("hidden");
    el("categoryStep3").classList.add("hidden");
    renderTemplateGrid();
  };

  const showTopicStep = () => {
    el("categoryStep1").classList.add("hidden");
    el("categoryStep2").classList.add("hidden");
    el("categoryStep3").classList.remove("hidden");

    // 선택 정보 표시
    el("selectedCategoryName").innerText = `${selectedCategory.icon} ${selectedCategory.name}`;
    el("selectedTemplateName").innerText = `${selectedTemplate.icon} ${selectedTemplate.name}`;
  };

  // 카테고리 모달 열기/닫기
  window.openCategoryModal = () => {
    selectedCategory = null;
    selectedTemplate = null;
    showCategoryStep();
    renderCategoryGrid();
    el("categoryModal").classList.add("show");
  };

  window.closeCategoryModal = () => {
    el("categoryModal").classList.remove("show");
  };

  window.backToCategories = () => {
    showCategoryStep();
  };

  window.backToTemplates = () => {
    showTemplateStep();
  };

  // 카테고리 버튼 클릭
  const categoryBtn = el("openCategoryBtn");
  if (categoryBtn) {
    categoryBtn.onclick = openCategoryModal;
  }

  // 템플릿 기반 스크립트 생성
  const generateFromTemplateBtn = el("generateFromTemplate");
  if (generateFromTemplateBtn) {
    generateFromTemplateBtn.onclick = async () => {
      const topic = el("categoryTopic").value.trim();
      if (!topic) return showToast("주제를 입력해주세요.");

      const btn = generateFromTemplateBtn;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner"></div> 생성 중...`;

      try {
        // 템플릿 기반 분석 데이터 구성
        const templateAnalysis = {
          one_line_summary: `${selectedCategory.name} 분야의 ${selectedTemplate.name} 콘텐츠`,
          viral_score: 75,
          keywords: [selectedCategory.name, topic],
          timeline: selectedTemplate.timeline
        };

        // 스크립트 생성 API 호출
        const res = await postJSON("/api/generate", {
          topic,
          analysis: templateAnalysis,
          tone: "default",
          style: "default",
          audience: "",
          category: selectedCategory.name,
          template: selectedTemplate.name
        });

        // 모달 닫기
        closeCategoryModal();

        // 결과 표시
        state.analysis = templateAnalysis;
        renderBlueprint(templateAnalysis);

        const id = `Ver ${state.scripts.length + 1}`;
        state.scripts.push({ id, text: res.script });
        state.activeScriptId = id;

        renderScriptTabs();
        renderScriptContent(res.script);
        showToast("스크립트가 생성되었습니다! ✨");

        // 결과로 스크롤
        el("step3Panel")?.scrollIntoView({ behavior: "smooth", block: "start" });

      } catch (e) {
        showToast(`생성 실패: ${e.message}`);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    };
  }

  // ========================================
  // 인기 영상 탐색 (exploreWorkspace) 기능
  // ========================================

  let exploreSelectedCategory = null;

  // 탐색 Step 초기화
  const resetExploreSteps = () => {
    exploreSelectedCategory = null;
    const step1 = el("exploreStep1");
    const step2 = el("exploreStep2");
    if (step1) step1.classList.remove("hidden");
    if (step2) step2.classList.add("hidden");
  };

  // 카테고리 그리드 렌더링 (탐색용)
  const renderExploreCategoryGrid = () => {
    const grid = el("exploreCategoryGrid");
    if (!grid) return;

    grid.innerHTML = CATEGORIES.map(cat => `
      <div class="category-card-page" data-cat-id="${cat.id}">
        <span class="cat-icon-large">${cat.icon}</span>
        <span class="cat-name">${cat.name}</span>
      </div>
    `).join("");

    // 클릭 이벤트
    grid.querySelectorAll(".category-card-page").forEach(item => {
      item.onclick = () => {
        exploreSelectedCategory = CATEGORIES.find(c => c.id === item.dataset.catId);
        showExploreVideoStep();
      };
    });
  };

  // 영상 목록 Step으로 이동
  const showExploreVideoStep = async (addToHistory = true) => {
    const step1 = el("exploreStep1");
    const step2 = el("exploreStep2");
    const categoryBadge = el("exploreCategoryBadge");
    const videoCount = el("exploreVideoCount");
    const videoGrid = el("exploreVideoGrid");

    if (step1) step1.classList.add("hidden");
    if (step2) step2.classList.remove("hidden");

    // 카테고리 뱃지 표시
    if (categoryBadge && exploreSelectedCategory) {
      categoryBadge.innerText = `${exploreSelectedCategory.icon} ${exploreSelectedCategory.name}`;
    }

    // 로딩 상태 표시
    if (videoGrid) {
      videoGrid.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>인기 영상을 불러오는 중...</p>
        </div>
      `;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // History에 추가
    if (addToHistory) {
      history.pushState({ page: 'explore', subPage: 'videos', categoryId: exploreSelectedCategory?.id }, '', '#explore/videos');
    }

    // API 호출
    try {
      const response = await fetch(`/api/popular-videos?category=${encodeURIComponent(exploreSelectedCategory.id)}`);
      if (!response.ok) {
        throw new Error("영상 목록을 불러올 수 없습니다.");
      }
      const data = await response.json();
      const videos = data.videos || [];

      // 영상 개수 표시
      if (videoCount) {
        videoCount.innerText = `${videos.length}개 영상`;
      }

      // 영상 그리드 렌더링
      renderExploreVideoGrid(videos);

    } catch (e) {
      if (videoGrid) {
        videoGrid.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">😢</span>
            <p>${e.message}</p>
          </div>
        `;
      }
      if (videoCount) {
        videoCount.innerText = "0개 영상";
      }
    }
  };

  // 영상 카드 렌더링
  const renderExploreVideoGrid = (videos) => {
    const videoGrid = el("exploreVideoGrid");
    if (!videoGrid) return;

    if (!videos || videos.length === 0) {
      videoGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📹</span>
          <p>이 카테고리에서 인기 영상을 찾지 못했습니다.</p>
        </div>
      `;
      return;
    }

    videoGrid.innerHTML = videos.map(video => {
      const videoId = extractVideoIdFromUrl(video.url);
      // sddefault.jpg는 삭제된 영상에서 404를 반환하는 경우가 많음
      const thumbnailUrl = videoId
        ? `https://img.youtube.com/vi/${videoId}/sddefault.jpg`
        : "";
      const duration = video.duration || "0:00";
      const viralRatio = video.viral_ratio || 0;
      const subscribers = video.subscribers || "";
      const uploadedAt = video.uploaded_at || "";

      // 바이럴 뱃지 (2배 이상이면 표시)
      const viralBadge = viralRatio >= 2
        ? `<span class="viral-badge">🔥 ${viralRatio}배</span>`
        : "";

      return `
        <div class="video-card" data-video-url="${video.url}">
          <div class="video-thumbnail">
            <img src="${thumbnailUrl}" alt="${video.title || ''}" onerror="this.closest('.video-card').style.display='none'" onload="if(this.naturalWidth<200||this.naturalHeight<100)this.closest('.video-card').style.display='none'">
            ${viralBadge}
            <span class="video-duration">${duration}</span>
          </div>
          <div class="video-info">
            <h4 class="video-title">${video.title || "제목 없음"}</h4>
            <div class="video-meta">
              <span class="video-channel">${video.channel || "채널명"}${subscribers ? ` · 구독자 ${subscribers}` : ""}</span>
            </div>
            <div class="video-stats-row">
              <span>조회수 ${video.views || "0"}</span>
              ${uploadedAt ? `<span>· ${uploadedAt}</span>` : ""}
            </div>
            <div class="video-action-buttons">
              <button class="video-action-btn primary">🎯 구조 분석</button>
              <a href="${video.url}" target="_blank" rel="noopener" class="video-action-btn secondary">▶ 원본 보기</a>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // "구조 분석" 버튼 클릭 이벤트
    videoGrid.querySelectorAll(".video-action-btn.primary").forEach(btn => {
      btn.onclick = (e) => {
        const card = e.target.closest(".video-card");
        if (!card) return;
        const videoUrl = card.dataset.videoUrl;
        if (videoUrl) {
          goToAnalyzeWithUrl(videoUrl);
        }
      };
    });
  };

  // URL에서 Video ID 추출 (탐색용)
  const extractVideoIdFromUrl = (url) => {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  // 조회수 포맷팅
  const formatViewCount = (count) => {
    if (!count) return "0";
    const num = Number(count);
    if (num >= 100000000) {
      return (num / 100000000).toFixed(1) + "억";
    } else if (num >= 10000) {
      return (num / 10000).toFixed(1) + "만";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "천";
    }
    return num.toString();
  };

  // mainWorkspace로 이동 + URL 자동 입력
  const goToAnalyzeWithUrl = (videoUrl) => {
    // exploreWorkspace 숨기기
    const exploreWs = el("exploreWorkspace");
    if (exploreWs) exploreWs.classList.add("hidden");

    // selectionSection 숨기기
    if (selectionSection) selectionSection.classList.add("hidden");

    // mainWorkspace 표시
    if (mainWorkspace) mainWorkspace.classList.remove("hidden");

    // URL 입력란에 자동 입력
    const urlInput = el("urlInput");
    if (urlInput) {
      urlInput.value = videoUrl;
      // 썸네일 미리보기 트리거
      urlInput.dispatchEvent(new Event("input"));
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 입력란 포커스
    setTimeout(() => {
      if (urlInput) urlInput.focus();
    }, 300);

    showToast("URL이 입력되었습니다. 분석하기 버튼을 클릭하세요.");
  };

  // 탐색 뒤로가기 (-> 선택 화면)
  const backFromExploreBtn = el("backFromExplore");
  if (backFromExploreBtn) {
    backFromExploreBtn.onclick = () => {
      history.back();
    };
  }

  // Step2에서 Step1로 뒤로가기 (카테고리 다시 선택)
  window.backToExploreCategoriesPage = () => {
    history.back();
  };

  // 내부 탐색 스텝 전환 (히스토리 없이)
  const showExploreCategoryStep = () => {
    exploreSelectedCategory = null;
    const step1 = el("exploreStep1");
    const step2 = el("exploreStep2");
    if (step1) step1.classList.remove("hidden");
    if (step2) step2.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // popstate에서 explore 서브페이지 처리를 위해 전역 노출
  window._showExploreCategoryStep = showExploreCategoryStep;
});
