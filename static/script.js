const state = {
  analysis: null,
  originalTimeline: null,
  apiKey: "",
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
  const container = el("analyzeProgress");
  if (container) container.classList.add("hidden");
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
  // Load Key
  const storedKey = localStorage.getItem("vc_api_key");
  if (storedKey) {
    state.apiKey = storedKey;
    el("apiKeyInput").value = storedKey;
  }

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

  // Save Key
  el("saveKeyBtn").onclick = async () => {
    const key = el("apiKeyInput").value.trim();
    if (!key) return showToast("API 키를 입력해주세요.");

    state.apiKey = key;
    localStorage.setItem("vc_api_key", key);

    const modalEl = el("settingsModal");
    try {
      await postJSON("/api/save-key", { api_key: key });
      showToast("API 키가 저장되었습니다.");
    } catch (e) {
      showToast("서버 오류! (로컬에는 저장됨)");
    } finally {
      if (modalEl) modalEl.classList.remove("show");
    }
  };

  // Analyze
  el("analyzeBtn").onclick = async () => {
    const url = el("urlInput").value.trim();
    if (!url) return showToast("URL을 입력해주세요.");
    if (!state.apiKey) return showToast("API 키를 설정해주세요.", "설정하기", () => openSettingsModal());

    const btn = el("analyzeBtn");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner"></div> 분석 중...`;

    // Show progress
    updateProgress(1);

    try {
      // Simulate progress
      setTimeout(() => updateProgress(2), 500);
      setTimeout(() => updateProgress(3), 1500);
      setTimeout(() => updateProgress(4), 3000);

      const data = await postJSON("/api/analyze", { api_key: state.apiKey, url });
      renderBlueprint(data);
      showToast("분석이 완료되었습니다! 🎉");
    } catch (e) {
      showToast(`분석 실패: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
      hideProgress();
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
        api_key: state.apiKey,
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

  // Hero CTA Button - Scroll to URL input
  el("heroStartBtn").onclick = () => {
    const urlInput = el("urlInput");
    if (urlInput) {
      urlInput.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => urlInput.focus(), 500);
    }
  };

  // Initialize
  updateGenerateButton();
});
