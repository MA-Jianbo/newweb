(() => {
  "use strict";

  const STORAGE_KEY = "staticweb2_redraw_today_v3";
  const MIN_PERIOD_WEIGHT = 1.5;
  const MAX_DAY_SCALE = 1.3;
  const DEFAULT_DAY_SCALE = 1;
  const DEFAULT_COLORS = {
    morning: "#a9d8e8",
    daytime: "#f7dc8a",
    night: "#9387c6"
  };

  const PERIODS = [
    {
      id: "morning",
      label: "朝",
      colorLabel: "朝の色",
      range: "06:00-11:59",
      start: "06:00",
      end: "12:00",
      baseDuration: 6
    },
    {
      id: "daytime",
      label: "昼",
      colorLabel: "昼の色",
      range: "12:00-17:59",
      start: "12:00",
      end: "18:00",
      baseDuration: 6
    },
    {
      id: "night",
      label: "夜",
      colorLabel: "夜の色",
      range: "18:00-翌05:59",
      start: "18:00",
      end: "翌06:00",
      baseDuration: 12
    }
  ];

  const RULER_LABELS = ["06:00", "12:00", "18:00", "00:00", "翌06:00"];

  const els = {
    realTimeline: document.querySelector("#realTimeline"),
    realRuler: document.querySelector("#realRuler"),
    realScroll: document.querySelector("#realScroll"),
    subjectiveTimeline: document.querySelector("#subjectiveTimeline"),
    feltRuler: document.querySelector("#feltRuler"),
    dayScale: document.querySelector("#dayScale"),
    dayScaleValue: document.querySelector("#dayScaleValue"),
    dayLengthText: document.querySelector("#dayLengthText"),
    selectedPeriodText: document.querySelector("#selectedPeriodText"),
    colorControls: document.querySelector("#colorControls"),
    saveShape: document.querySelector("#saveShape"),
    resetTime: document.querySelector("#resetTime"),
    resetAll: document.querySelector("#resetAll"),
    resultSection: document.querySelector("#resultSection"),
    resultDate: document.querySelector("#resultDate"),
    resultTimeline: document.querySelector("#resultTimeline"),
    resultRuler: document.querySelector("#resultRuler"),
    resultMeta: document.querySelector("#resultMeta"),
    exportPng: document.querySelector("#exportPng"),
    downloadJson: document.querySelector("#downloadJson"),
    backToEdit: document.querySelector("#backToEdit"),
    testSubmission: document.querySelector("#testSubmission"),
    serverSaveStatus: document.querySelector("#serverSaveStatus"),
    resultServerSaveStatus: document.querySelector("#resultServerSaveStatus")
  };

  let baseWidth = 720;
  let state = loadState();
  let activeDrag = null;
  let isSubmitting = false;
  let lastSubmittedFingerprint = null;
  let lastResponseId = null;

  function createDefaultState() {
    return {
      date: getLocalDateString(),
      selectedPeriod: "morning",
      dayScale: DEFAULT_DAY_SCALE,
      periodWeights: PERIODS.map((period) => period.baseDuration),
      colors: { ...DEFAULT_COLORS },
      savedAt: null
    };
  }

  function loadState() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch (error) {
      return createDefaultState();
    }
  }

  function normalizeState(saved) {
    const fresh = createDefaultState();
    if (!saved || typeof saved !== "object") return fresh;

    const rawWeights = Array.isArray(saved.periodWeights) ? saved.periodWeights : fresh.periodWeights;
    return {
      date: typeof saved.date === "string" ? saved.date : fresh.date,
      selectedPeriod: PERIODS.some((period) => period.id === saved.selectedPeriod) ? saved.selectedPeriod : fresh.selectedPeriod,
      dayScale: roundTo(clampNumber(saved.dayScale, 0.5, MAX_DAY_SCALE, fresh.dayScale), 2),
      periodWeights: PERIODS.map((period, index) => {
        return roundTo(Math.max(MIN_PERIOD_WEIGHT, clampNumber(rawWeights[index], MIN_PERIOD_WEIGHT, 48, period.baseDuration)), 2);
      }),
      colors: {
        morning: normalizeColor(saved.colors?.morning, DEFAULT_COLORS.morning),
        daytime: normalizeColor(saved.colors?.daytime, DEFAULT_COLORS.daytime),
        night: normalizeColor(saved.colors?.night, DEFAULT_COLORS.night)
      },
      savedAt: typeof saved.savedAt === "string" ? saved.savedAt : null
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback;
  }

  function roundTo(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function getLocalDateString() {
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(new Date());
  }

  function totalWeight(weights = state.periodWeights) {
    return weights.reduce((sum, weight) => sum + weight, 0);
  }

  function getTimelineWidth() {
    return Math.round(baseWidth * state.dayScale);
  }

  function getSelectedPeriod() {
    return PERIODS.find((period) => period.id === state.selectedPeriod) || PERIODS[0];
  }

  function initStaticControls() {
    els.colorControls.innerHTML = "";
    PERIODS.forEach((period) => {
      const item = document.createElement("div");
      item.className = "color-item";

      const label = document.createElement("label");
      label.htmlFor = `color-${period.id}`;
      label.textContent = period.colorLabel;

      const input = document.createElement("input");
      input.type = "color";
      input.id = `color-${period.id}`;
      input.dataset.period = period.id;

      item.append(label, input);
      els.colorControls.append(item);
    });

    renderRealityTimeline();
  }

  function renderRealityTimeline() {
    const fragment = document.createDocumentFragment();
    const baseTotal = PERIODS.reduce((sum, period) => sum + period.baseDuration, 0);
    els.realTimeline.innerHTML = "";
    els.realTimeline.style.width = `${baseWidth}px`;

    PERIODS.forEach((period) => {
      const segment = document.createElement("div");
      segment.className = "real-period";
      segment.style.flexBasis = `${(period.baseDuration / baseTotal) * 100}%`;
      segment.setAttribute("aria-label", `${period.label} ${period.range}`);
      segment.append(createPeriodText(period));
      fragment.append(segment);
    });

    els.realTimeline.append(fragment);
    renderRuler(els.realRuler, getRealityRulerPositions(), baseWidth);
  }

  function createPeriodText(period) {
    const container = document.createDocumentFragment();
    const label = document.createElement("span");
    label.className = "period-label";
    label.textContent = period.label;
    container.append(label);
    return container;
  }

  function renderSubjectiveTimeline(target = els.subjectiveTimeline, ruler = els.feltRuler, options = {}) {
    const timelineWidth = getTimelineWidth();
    const weightSum = totalWeight();
    const fragment = document.createDocumentFragment();
    target.innerHTML = "";
    target.style.width = `${timelineWidth}px`;

    PERIODS.forEach((period, index) => {
      const weight = state.periodWeights[index];
      const ratio = weight / weightSum;
      const segment = document.createElement("button");
      segment.type = "button";
      segment.className = "period-segment";
      segment.style.flexBasis = `${ratio * 100}%`;
      segment.style.backgroundColor = state.colors[period.id];
      segment.dataset.period = period.id;
      segment.setAttribute("aria-label", `${period.label} ${period.range}、感じた長さ ${weight.toFixed(2)}`);
      segment.title = `${period.label} ${period.range} / ${weight.toFixed(2)}`;

      if (ratio < 0.12) {
        segment.classList.add("is-tight");
      }

      if (!options.readonly) {
        segment.addEventListener("click", () => selectPeriod(period.id));
        segment.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectPeriod(period.id);
          }
        });
        if (period.id === state.selectedPeriod) {
          segment.classList.add("is-selected");
        }
      } else {
        segment.tabIndex = -1;
      }

      segment.append(createPeriodText(period));
      fragment.append(segment);
    });

    if (!options.readonly) {
      let cumulative = 0;
      for (let boundary = 0; boundary < PERIODS.length - 1; boundary += 1) {
        cumulative += state.periodWeights[boundary] / weightSum;
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "period-handle";
        handle.style.left = `${cumulative * 100}%`;
        handle.dataset.boundary = String(boundary);
        handle.setAttribute("aria-label", `${PERIODS[boundary].label} と ${PERIODS[boundary + 1].label} の境界`);
        handle.title = "境界を動かす";
        handle.addEventListener("pointerdown", startBoundaryDrag);
        handle.addEventListener("keydown", handleBoundaryKeydown);
        fragment.append(handle);
      }
    }

    target.append(fragment);
    renderRuler(ruler, getSubjectiveRulerPositions(), timelineWidth);
  }

  function renderRuler(target, positions, width) {
    target.innerHTML = "";
    target.style.width = `${width}px`;
    RULER_LABELS.forEach((label, index) => {
      const span = document.createElement("span");
      span.textContent = label;
      span.style.left = `${positions[index] * 100}%`;
      target.append(span);
    });
  }

  function getRealityRulerPositions() {
    return [0, 0.25, 0.5, 0.75, 1];
  }

  function getSubjectiveRulerPositions() {
    const weights = state.periodWeights;
    const sum = totalWeight(weights);
    const morningEnd = weights[0] / sum;
    const daytimeEnd = (weights[0] + weights[1]) / sum;
    const midnight = (weights[0] + weights[1] + weights[2] * 0.5) / sum;
    return [0, morningEnd, daytimeEnd, midnight, 1];
  }

  function selectPeriod(periodId) {
    if (!PERIODS.some((period) => period.id === periodId)) return;
    state.selectedPeriod = periodId;
    saveState();
    renderAll();
  }

  function startBoundaryDrag(event) {
    const boundary = clampNumber(event.currentTarget.dataset.boundary, 0, PERIODS.length - 2, 0);
    const left = state.periodWeights[boundary];
    const right = state.periodWeights[boundary + 1];
    const pairSum = left + right;
    const lineWidth = els.subjectiveTimeline.getBoundingClientRect().width;
    const pairWidth = lineWidth * (pairSum / totalWeight());

    activeDrag = {
      boundary,
      startX: event.clientX,
      left,
      right,
      pairSum,
      pairWidth
    };

    state.selectedPeriod = PERIODS[boundary].id;
    event.currentTarget.classList.add("is-active");
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", moveBoundaryDrag);
    window.addEventListener("pointerup", endBoundaryDrag, { once: true });
  }

  function moveBoundaryDrag(event) {
    if (!activeDrag) return;
    const delta = event.clientX - activeDrag.startX;
    const usablePairWidth = Math.max(1, activeDrag.pairWidth);
    const proposedLeft = activeDrag.left + (delta / usablePairWidth) * activeDrag.pairSum;
    const leftMin = MIN_PERIOD_WEIGHT;
    const leftMax = Math.max(MIN_PERIOD_WEIGHT, activeDrag.pairSum - MIN_PERIOD_WEIGHT);
    const nextLeft = roundTo(clampNumber(proposedLeft, leftMin, leftMax, activeDrag.left), 2);
    const nextRight = roundTo(activeDrag.pairSum - nextLeft, 2);

    state.periodWeights[activeDrag.boundary] = nextLeft;
    state.periodWeights[activeDrag.boundary + 1] = Math.max(MIN_PERIOD_WEIGHT, nextRight);
    renderAll({ keepDrag: true });
  }

  function endBoundaryDrag() {
    document.querySelectorAll(".period-handle.is-active").forEach((handle) => {
      handle.classList.remove("is-active");
    });
    activeDrag = null;
    saveState();
    renderAll();
  }

  function handleBoundaryKeydown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    const boundary = clampNumber(event.currentTarget.dataset.boundary, 0, PERIODS.length - 2, 0);
    const pairSum = state.periodWeights[boundary] + state.periodWeights[boundary + 1];
    const leftMin = MIN_PERIOD_WEIGHT;
    const leftMax = Math.max(MIN_PERIOD_WEIGHT, pairSum - MIN_PERIOD_WEIGHT);
    let nextLeft = state.periodWeights[boundary];

    if (event.key === "ArrowLeft") nextLeft -= event.shiftKey ? 1 : 0.25;
    if (event.key === "ArrowRight") nextLeft += event.shiftKey ? 1 : 0.25;
    if (event.key === "Home") nextLeft = leftMin;
    if (event.key === "End") nextLeft = leftMax;

    nextLeft = roundTo(clampNumber(nextLeft, leftMin, leftMax, state.periodWeights[boundary]), 2);
    state.periodWeights[boundary] = nextLeft;
    state.periodWeights[boundary + 1] = roundTo(pairSum - nextLeft, 2);
    state.selectedPeriod = PERIODS[boundary].id;
    saveState();
    renderAll();
  }

  function updateControls() {
    const selected = getSelectedPeriod();
    els.dayScale.value = String(state.dayScale);
    els.dayScaleValue.value = `${state.dayScale.toFixed(2)}倍`;
    if (els.dayLengthText) {
      els.dayLengthText.textContent = `一日の長さ ${state.dayScale.toFixed(2)}倍`;
    }
    if (els.selectedPeriodText) {
      els.selectedPeriodText.textContent = `${selected.label} ${selected.range} を選択中`;
    }

    PERIODS.forEach((period) => {
      const input = document.querySelector(`#color-${period.id}`);
      if (input) input.value = state.colors[period.id];
    });
  }

  function renderAll(options = {}) {
    updateControls();
    renderRealityTimeline();
    renderSubjectiveTimeline();
    if (!els.resultSection.hidden) renderResult();
    if (!options.keepDrag) saveState();
    refreshSubmissionNotice();
  }

  function updateBaseWidth() {
    const containerWidth = els.realScroll?.clientWidth || 900;
    baseWidth = Math.min(760, Math.max(320, Math.round(containerWidth * 0.72)));
    renderAll();
  }

  function resetTimeOnly() {
    state.periodWeights = PERIODS.map((period) => period.baseDuration);
    state.dayScale = DEFAULT_DAY_SCALE;
    state.selectedPeriod = "morning";
    state.savedAt = null;
    saveState();
    renderAll();
  }

  function resetEverything() {
    // リセットした後は、同じ初期値でも別の回答として送信できます。
    lastSubmittedFingerprint = null;
    lastResponseId = null;
    setServerStatus("");
    state = createDefaultState();
    localStorage.removeItem(STORAGE_KEY);
    els.resultSection.hidden = true;
    renderAll();
  }

  function buildExportData() {
    const sum = totalWeight();
    return {
      project: "あなたの今日どうでしたか",
      date: state.date,
      timeZone: "Asia/Tokyo",
      timelineOrder: "06:00-翌06:00",
      savedAt: state.savedAt,
      dayLengthScale: state.dayScale,
      colors: { ...state.colors },
      periods: PERIODS.map((period, index) => {
        const visualRatio = state.periodWeights[index] / sum;
        return {
          id: period.id,
          label: period.label,
          range: period.range,
          start: period.start,
          end: period.end,
          baseDurationHours: period.baseDuration,
          durationWeight: roundTo(state.periodWeights[index], 2),
          color: state.colors[period.id],
          visualRatio: roundTo(visualRatio, 6),
          visualLengthRelativeToRealityDay: roundTo(visualRatio * state.dayScale, 6)
        };
      })
    };
  }

  function renderResult() {
    const date = new Date(`${state.date}T00:00:00+09:00`);
    els.resultDate.dateTime = state.date;
    els.resultDate.textContent = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);

    renderSubjectiveTimeline(els.resultTimeline, els.resultRuler, { readonly: true });

    els.resultMeta.innerHTML = "";
    PERIODS.forEach((period, index) => {
      const chip = document.createElement("span");
      chip.className = "color-chip";

      const dot = document.createElement("span");
      dot.className = "color-dot";
      dot.style.backgroundColor = state.colors[period.id];

      const label = document.createElement("span");
      label.textContent = `${period.label} ${state.periodWeights[index].toFixed(2)} / ${state.colors[period.id]}`;

      chip.append(dot, label);
      els.resultMeta.append(chip);
    });
  }

  // 画面上の「編集用状態」と、サーバーに保存する数値は別々に扱う。
  // この作品の朝・昼・夜は3区間で、24時間それぞれを独立入力する形式ではない。
  function buildSubmissionData() {
    const sum = totalWeight();
    return {
      answer_date: state.date,
      morning_share: String(state.periodWeights[0] / sum),
      afternoon_share: String(state.periodWeights[1] / sum),
      night_share: String(state.periodWeights[2] / sum),
      day_scale: String(state.dayScale),
      morning_color: state.colors.morning,
      afternoon_color: state.colors.daytime,
      night_color: state.colors.night,
      is_test: els.testSubmission.checked ? "1" : "0"
    };
  }

  function setServerStatus(message, status = "") {
    [els.serverSaveStatus, els.resultServerSaveStatus].forEach((element) => {
      element.textContent = message;
      if (status) {
        element.dataset.state = status;
      } else {
        delete element.dataset.state;
      }
    });
  }

  function refreshSubmissionNotice() {
    if (isSubmitting || !lastSubmittedFingerprint) return;
    const unchanged = JSON.stringify(buildSubmissionData()) === lastSubmittedFingerprint;
    if (unchanged) {
      setServerStatus(`この内容は保存済みです（回答 No. ${lastResponseId}）。`, "success");
    } else {
      setServerStatus("変更した内容は、まだサーバーに保存されていません。", "working");
    }
  }

  async function saveShape() {
    if (isSubmitting) return;

    // 元の結果カード、PNG・JSON保存はそのまま残す。
    state.savedAt = new Date().toISOString();
    saveState();
    els.resultSection.hidden = false;
    renderResult();

    const payload = buildSubmissionData();
    const fingerprint = JSON.stringify(payload);
    if (lastSubmittedFingerprint === fingerprint) {
      setServerStatus(`この内容はすでに保存済みです（回答 No. ${lastResponseId}）。`, "success");
      els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    isSubmitting = true;
    els.saveShape.disabled = true;
    setServerStatus("サーバーに回答を送信しています…", "working");

    try {
      // 独自 UI のため、フォーム遷移させず fetch で講義と同じ /responses に送信する。
      const response = await fetch("/responses", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.saved !== true) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      lastSubmittedFingerprint = fingerprint;
      lastResponseId = result.id;
      if (JSON.stringify(buildSubmissionData()) === fingerprint) {
        setServerStatus(`サーバーへの保存が完了しました（回答 No. ${result.id}${payload.is_test === "1" ? "・テスト" : ""}）。`, "success");
      } else {
        setServerStatus(`変更前の内容を回答 No. ${result.id} として保存しました。現在の変更はまだ保存していません。`, "working");
      }
    } catch (error) {
      console.error("回答の保存に失敗しました", error);
      setServerStatus("結果カードは作成できましたが、サーバーへの保存に失敗しました。サーバーを確認し、もう一度押してください。", "error");
    } finally {
      isSubmitting = false;
      els.saveShape.disabled = false;
      els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function downloadJson() {
    if (!state.savedAt) {
      state.savedAt = new Date().toISOString();
      saveState();
    }
    const data = buildExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `anata-no-kyou-${state.date}.json`);
    URL.revokeObjectURL(url);
  }

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function exportPng() {
    if (!state.savedAt) {
      state.savedAt = new Date().toISOString();
      saveState();
      els.resultSection.hidden = false;
      renderResult();
    }

    const canvas = buildResultCanvas();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `anata-no-kyou-${state.date}.png`);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function buildResultCanvas() {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const realWidth = 1240;
    const feltWidth = Math.round(realWidth * state.dayScale);
    const margin = 96;
    const width = Math.max(1440, feltWidth + margin * 2);
    const height = 760;
    const canvas = document.createElement("canvas");
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#f7f4ef";
    ctx.fillRect(0, 0, width, height);

    drawGrid(ctx, width, height);
    drawText(ctx, "あなたの今日", margin, 112, 56, "#1d1d1b", "500");
    drawText(ctx, formatDisplayDate(state.date), margin, 158, 24, "#74716b", "400");
    drawText(ctx, "これが、あなたの感じた今日の長さです。", margin, 206, 28, "#1d1d1b", "400");

    drawText(ctx, "現実の時間", margin, 282, 22, "#74716b", "600");
    drawPeriodCanvas(ctx, margin, 306, realWidth, 54, PERIODS.map((period) => period.baseDuration), true);
    drawRulerCanvas(ctx, margin, 386, realWidth, getRealityRulerPositions());

    drawText(ctx, "あなたが感じた時間", margin, 462, 22, "#74716b", "600");
    drawPeriodCanvas(ctx, margin, 488, feltWidth, 94, state.periodWeights, false);
    drawRulerCanvas(ctx, margin, 612, feltWidth, getSubjectiveRulerPositions());

    let chipX = margin;
    const chipY = 680;
    PERIODS.forEach((period) => {
      const text = `${period.label} ${state.colors[period.id]}`;
      const chipWidth = 42 + ctx.measureText(text).width + 26;
      drawRoundRect(ctx, chipX, chipY, chipWidth, 42, 21, "#fffdf9", "#d9d3c9");
      ctx.fillStyle = state.colors[period.id];
      ctx.beginPath();
      ctx.arc(chipX + 24, chipY + 21, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(29, 29, 27, 0.22)";
      ctx.stroke();
      drawText(ctx, text, chipX + 42, chipY + 27, 17, "#1d1d1b", "400");
      chipX += chipWidth + 12;
    });

    return canvas;
  }

  function drawGrid(ctx, width, height) {
    ctx.strokeStyle = "rgba(29, 29, 27, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawText(ctx, text, x, y, size, color, weight) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    ctx.fillText(text, x, y);
  }

  function drawPeriodCanvas(ctx, x, y, width, height, weights, reality) {
    const sum = totalWeight(weights);
    let currentX = x;

    PERIODS.forEach((period, index) => {
      const segmentWidth = (weights[index] / sum) * width;
      ctx.fillStyle = reality ? "#fffdf9" : state.colors[period.id];
      ctx.fillRect(currentX, y, segmentWidth, height);
      ctx.strokeStyle = "rgba(29, 29, 27, 0.2)";
      ctx.strokeRect(currentX, y, segmentWidth, height);
      if (segmentWidth > 58) {
        drawText(ctx, period.label, currentX + 14, y + height / 2 + 7, 20, "rgba(29, 29, 27, 0.82)", "600");
      }
      currentX += segmentWidth;
    });

    ctx.strokeStyle = "#d9d3c9";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);
    ctx.lineWidth = 1;
  }

  function drawRulerCanvas(ctx, x, y, width, positions) {
    ctx.fillStyle = "#74716b";
    ctx.font = '400 16px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    RULER_LABELS.forEach((label, index) => {
      const position = x + width * positions[index];
      const textWidth = ctx.measureText(label).width;
      const adjusted = index === 0 ? position : index === RULER_LABELS.length - 1 ? position - textWidth : position - textWidth / 2;
      ctx.fillText(label, adjusted, y);
    });
  }

  function drawRoundRect(ctx, x, y, width, height, radius, fill, stroke) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  function formatDisplayDate(dateString) {
    const date = new Date(`${dateString}T00:00:00+09:00`);
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date);
  }

  els.dayScale.addEventListener("input", (event) => {
    state.dayScale = roundTo(clampNumber(event.target.value, 0.5, MAX_DAY_SCALE, DEFAULT_DAY_SCALE), 2);
    saveState();
    renderAll();
  });

  els.colorControls.addEventListener("input", (event) => {
    const input = event.target.closest("input[type='color']");
    if (!input) return;
    state.colors[input.dataset.period] = normalizeColor(input.value, state.colors[input.dataset.period]);
    saveState();
    renderAll();
  });

  els.testSubmission.addEventListener("change", refreshSubmissionNotice);
  els.saveShape.addEventListener("click", saveShape);
  els.resetTime.addEventListener("click", resetTimeOnly);
  els.resetAll.addEventListener("click", resetEverything);
  els.downloadJson.addEventListener("click", downloadJson);
  els.exportPng.addEventListener("click", exportPng);
  els.backToEdit.addEventListener("click", () => {
    document.querySelector("#felt-title").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(updateBaseWidth.timeout);
    updateBaseWidth.timeout = window.setTimeout(updateBaseWidth, 120);
  });

  initStaticControls();
  updateBaseWidth();
})();