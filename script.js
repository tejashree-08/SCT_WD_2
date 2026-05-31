/* =========================================================
   NEXUS Calculator — vanilla JS
   Handles: input, operations, history, themes, sound,
            keyboard, ripple, particles background.
   ========================================================= */
(() => {
  // ---------- State ----------
  const state = {
    current: "0",      // current entry as string
    previous: null,    // previous value as number
    operator: null,    // pending operator: + - * /
    justEvaluated: false,
    expression: "",    // live expression preview
    history: [],
    sound: true,
    theme: "dark",
  };
  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const resultEl = $("#result");
  const exprEl   = $("#expression");
  const historyList = $("#history-list");
  const toastEl  = $("#toast");
  const soundBtn = $("#toggle-sound");
  const themeBtn = $("#toggle-theme");
  const historyBtn = $("#toggle-history");
  const historyCard = $("#history-card");
  const copyBtn  = $("#copy-btn");
  const clearHistoryBtn = $("#clear-history");
  const loader   = $("#loader");
  // ---------- Helpers ----------
  const opSymbol = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  const fmt = (n) => {
    if (n === null || n === undefined || n === "") return "0";
    if (!isFinite(n)) return "Error";
    const num = Number(n);
    if (Number.isNaN(num)) return "Error";
    // Trim very long floats
    const abs = Math.abs(num);
    if (abs !== 0 && (abs < 1e-6 || abs >= 1e15)) return num.toExponential(6);
    const s = (Math.round(num * 1e10) / 1e10).toString();
    return s;
  };
  const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1500);
  };
  const render = () => {
    resultEl.textContent = state.current;
    let preview = "";
    if (state.previous !== null && state.operator) {
      preview = `${fmt(state.previous)} ${opSymbol[state.operator]} ${state.justEvaluated ? "" : (state.current === "0" ? "" : state.current)}`;
    } else if (state.expression) {
      preview = state.expression;
    }
    exprEl.innerHTML = preview || "&nbsp;";
  };
  const flash = (cls = "flash") => {
    resultEl.classList.remove(cls);
    void resultEl.offsetWidth;
    resultEl.classList.add(cls);
  };
  // ---------- Sound (WebAudio, no assets) ----------
  let audioCtx = null;
  const beep = (freq = 520, dur = 0.05, type = "triangle", gain = 0.04) => {
    if (!state.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g).connect(audioCtx.destination);
      const t = audioCtx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (_) { /* ignore */ }
  };
  // ---------- Core logic ----------
  const inputNumber = (n) => {
    if (state.justEvaluated) { state.current = "0"; state.justEvaluated = false; state.expression = ""; }
    if (state.current === "0") state.current = String(n);
    else if (state.current.length < 16) state.current += String(n);
  };
  const inputDecimal = () => {
    if (state.justEvaluated) { state.current = "0"; state.justEvaluated = false; }
    if (!state.current.includes(".")) state.current += ".";
  };
  const clearAll = () => {
    state.current = "0"; state.previous = null; state.operator = null;
    state.justEvaluated = false; state.expression = "";
    resultEl.classList.remove("err");
  };
  const backspace = () => {
    if (state.justEvaluated) return clearAll();
    if (state.current.length <= 1 || (state.current.length === 2 && state.current.startsWith("-"))) {
      state.current = "0";
    } else {
      state.current = state.current.slice(0, -1);
    }
  };
  const compute = (a, b, op) => {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? NaN : a / b;
    }
  };
  const setOperator = (op) => {
    const curr = parseFloat(state.current);
    if (state.previous !== null && state.operator && !state.justEvaluated) {
      const out = compute(state.previous, curr, state.operator);
      if (!isFinite(out)) return setError();
      state.previous = out;
      state.current = fmt(out);
    } else {
      state.previous = curr;
    }
    state.operator = op;
    state.justEvaluated = false;
    // Reset current so next digit starts fresh
    state.expression = `${fmt(state.previous)} ${opSymbol[op]}`;
    state.current = "0";
  };
  const equals = () => {
    if (state.operator === null || state.previous === null) return;
    const curr = parseFloat(state.current);
    const out = compute(state.previous, curr, state.operator);
    if (!isFinite(out) || Number.isNaN(out)) return setError();
    const expr = `${fmt(state.previous)} ${opSymbol[state.operator]} ${fmt(curr)}`;
    const result = fmt(out);
    pushHistory(expr, result);
    state.current = result;
    state.previous = null;
    state.operator = null;
    state.justEvaluated = true;
    state.expression = expr + " =";
    flash();
  };
  const setError = () => {
    state.current = "Error"; state.previous = null; state.operator = null;
    state.justEvaluated = true; state.expression = "";
    resultEl.classList.add("err");
    beep(160, 0.2, "sawtooth", 0.05);
  };
  // Unary
  const unary = (kind) => {
    const n = parseFloat(state.current);
    if (Number.isNaN(n)) return;
    let out, label;
    switch (kind) {
      case "sqrt":
        if (n < 0) return setError();
        out = Math.sqrt(n); label = `√(${fmt(n)})`; break;
      case "square":
        out = n * n; label = `(${fmt(n)})²`; break;
      case "reciprocal":
        if (n === 0) return setError();
        out = 1 / n; label = `1/(${fmt(n)})`; break;
      case "percent":
        // Context-aware: if mid-operation, percent of previous
        if (state.previous !== null && state.operator) {
          out = state.previous * (n / 100);
          label = `${fmt(n)}%`;
          state.current = fmt(out);
          state.expression = `${fmt(state.previous)} ${opSymbol[state.operator]} ${label}`;
          return;
        }
        out = n / 100; label = `${fmt(n)}%`; break;
      case "sign":
        out = -n; label = null; break;
    }
    state.current = fmt(out);
    if (label) {
      pushHistory(label, state.current);
      state.justEvaluated = true;
      state.expression = `${label} =`;
      flash();
    }
  };
  // ---------- History ----------
  const pushHistory = (expr, result) => {
    const item = { expr, result, time: new Date() };
    state.history.unshift(item);
    if (state.history.length > 50) state.history.pop();
    renderHistory();
    persist();
  };
  const renderHistory = () => {
    if (!state.history.length) {
      historyList.innerHTML = `<li class="history-empty">No calculations yet. Start crunching.</li>`;
      return;
    }
    historyList.innerHTML = state.history.map((h, i) => {
      const t = h.time instanceof Date ? h.time : new Date(h.time);
      const time = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return `<li class="history-item" data-idx="${i}">
        <div class="history-expr">${h.expr}</div>
        <div class="history-res">= ${h.result}</div>
        <div class="history-time">${time}</div>
      </li>`;
    }).join("");
  };
  historyList.addEventListener("click", (e) => {
    const li = e.target.closest(".history-item");
    if (!li) return;
    const idx = +li.dataset.idx;
    const h = state.history[idx];
    if (!h) return;
    state.current = h.result;
    state.previous = null; state.operator = null;
    state.justEvaluated = true; state.expression = h.expr + " =";
    render(); flash(); beep(700);
  });
  clearHistoryBtn.addEventListener("click", () => {
    state.history = [];
    renderHistory(); persist();
    showToast("HISTORY CLEARED");
    beep(300, 0.08, "square");
  });
  // ---------- Persist ----------
  const persist = () => {
    try {
      localStorage.setItem("nexus-state", JSON.stringify({
        history: state.history, sound: state.sound, theme: state.theme,
      }));
    } catch (_) {}
  };
  const restore = () => {
    try {
      const raw = localStorage.getItem("nexus-state");
      if (!raw) return;
      const data = JSON.parse(raw);
      state.history = (data.history || []).map(h => ({ ...h, time: new Date(h.time) }));
      state.sound = data.sound !== false;
      state.theme = data.theme || "dark";
    } catch (_) {}
  };
  // ---------- Buttons ----------
  document.querySelectorAll(".btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      ripple(e, btn);
      const num = btn.dataset.num;
      const op  = btn.dataset.op;
      const act = btn.dataset.action;
      if (num !== undefined) { inputNumber(num); beep(540, 0.04); }
      else if (op) { setOperator(op); beep(620, 0.05, "square"); }
      else if (act === "decimal") { inputDecimal(); beep(500); }
      else if (act === "clear") { clearAll(); beep(380, 0.08, "square"); }
      else if (act === "backspace") { backspace(); beep(420, 0.04, "square"); }
      else if (act === "equals") { equals(); beep(820, 0.08, "sine", 0.06); }
      else if (act === "sqrt" || act === "square" || act === "reciprocal" || act === "percent" || act === "sign") {
        unary(act); beep(700, 0.05, "triangle");
      }
      render();
    });
  });
  // Ripple effect
  const ripple = (e, el) => {
    const r = document.createElement("span");
    r.className = "ripple";
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = size + "px";
    const x = (e.clientX ?? rect.left + rect.width/2) - rect.left - size/2;
    const y = (e.clientY ?? rect.top + rect.height/2) - rect.top - size/2;
    r.style.left = x + "px"; r.style.top = y + "px";
    el.appendChild(r);
    setTimeout(() => r.remove(), 600);
  };
  // ---------- Copy ----------
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.current);
      showToast("COPIED " + state.current);
      beep(900, 0.06);
    } catch {
      showToast("COPY FAILED");
    }
  });
  // ---------- Sound toggle ----------
  soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    soundBtn.classList.toggle("off", !state.sound);
    soundBtn.querySelector(".dot").style.background = state.sound ? "" : "";
    soundBtn.lastChild.textContent = state.sound ? " SOUND" : " MUTED";
    persist(); beep(640);
  });
  // ---------- Theme toggle ----------
  const applyTheme = () => {
    document.body.classList.toggle("light", state.theme === "light");
    themeBtn.lastChild.textContent = " " + state.theme.toUpperCase();
  };
  themeBtn.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme(); persist(); beep(560);
  });
  // ---------- History toggle (mobile) ----------
  historyBtn.addEventListener("click", () => {
    historyCard.scrollIntoView({ behavior: "smooth", block: "center" });
    historyCard.animate(
      [{ boxShadow: "0 0 0 0 rgba(34,230,255,0)" }, { boxShadow: "0 0 0 14px rgba(34,230,255,.25)" }, { boxShadow: "0 0 0 0 rgba(34,230,255,0)" }],
      { duration: 900 }
    );
  });
  // ---------- Keyboard ----------
  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) { inputNumber(k); beep(540, 0.04); render(); return; }
    if (k === ".") { inputDecimal(); render(); return; }
    if (["+", "-", "*", "/"].includes(k)) { setOperator(k); beep(620, 0.05, "square"); render(); return; }
    if (k === "Enter" || k === "=") { e.preventDefault(); equals(); beep(820, 0.08); render(); return; }
    if (k === "Backspace") { backspace(); render(); return; }
    if (k === "Escape") { clearAll(); render(); return; }
    if (k === "%") { unary("percent"); render(); return; }
    if (k.toLowerCase() === "t") themeBtn.click();
    if (k.toLowerCase() === "s") soundBtn.click();
    if (k.toLowerCase() === "h") historyBtn.click();
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "c" && window.getSelection().toString() === "") {
      copyBtn.click();
    }
  });
  // ---------- Particle background ----------
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  let particles = [];
  let mouse = { x: -9999, y: -9999 };
  const resize = () => {
    canvas.width  = window.innerWidth  * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width  = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    initParticles();
  };
  const initParticles = () => {
    const count = Math.min(110, Math.floor((window.innerWidth * window.innerHeight) / 14000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4 * devicePixelRatio,
      vy: (Math.random() - 0.5) * 0.4 * devicePixelRatio,
      r: (Math.random() * 1.6 + 0.4) * devicePixelRatio,
      h: Math.random() * 80 + 180, // cyan→purple range
    }));
  };
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      // mouse attract
      const dx = mouse.x - p.x, dy = mouse.y - p.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < 20000) { p.vx += dx * 0.00002; p.vy += dy * 0.00002; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.h}, 95%, 65%, 0.85)`;
      ctx.shadowColor = `hsla(${p.h}, 95%, 65%, 0.9)`;
      ctx.shadowBlur = 12;
      ctx.fill();
    }
    // connecting lines
    ctx.shadowBlur = 0;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const max = 130 * devicePixelRatio;
        if (dist < max) {
          ctx.strokeStyle = `hsla(210, 90%, 70%, ${0.15 * (1 - dist / max)})`;
          ctx.lineWidth = devicePixelRatio * 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    requestAnimationFrame(tick);
  };
  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX * devicePixelRatio;
    mouse.y = e.clientY * devicePixelRatio;
    // Parallax tilt for calculator
    const calc = document.getElementById("calc");
    const cx = (e.clientX / window.innerWidth - 0.5);
    const cy = (e.clientY / window.innerHeight - 0.5);
    calc.style.transform = `perspective(1200px) rotateY(${cx * 3}deg) rotateX(${-cy * 3}deg)`;
  });
  window.addEventListener("mouseleave", () => { mouse.x = mouse.y = -9999; });
  // ---------- Init ----------
  restore();
  applyTheme();
  soundBtn.classList.toggle("off", !state.sound);
  soundBtn.lastChild.textContent = state.sound ? " SOUND" : " MUTED";
  renderHistory();
  render();
  resize();
  tick();
  window.addEventListener("load", () => {
    setTimeout(() => loader.classList.add("hide"), 600);
  });
})();
