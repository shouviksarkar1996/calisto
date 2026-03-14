const expressionInput = document.getElementById("expressionInput");
const resultEl = document.getElementById("result");
const historyList = document.getElementById("historyList");
const historyExportBtn = document.getElementById("historyExport");
const toast = document.getElementById("toast");
const toggleSignBtn = document.getElementById("toggleSign");
const themeSelect = document.getElementById("themeSelect");
const modeToggle = document.getElementById("angleToggle");
const precisionSelect = document.getElementById("precisionSelect");
const roundingSelect = document.getElementById("roundingSelect");
const soundToggle = document.getElementById("soundToggle");
const scienceToggle = document.getElementById("scienceToggle");
const memorySlots = document.querySelectorAll("[data-memory-slot]");
const graphCanvas = document.getElementById("graphCanvas");
const converterType = document.getElementById("converterType");
const converterInput = document.getElementById("converterInput");
const converterFrom = document.getElementById("converterFrom");
const converterTo = document.getElementById("converterTo");
const converterOutput = document.getElementById("converterOutput");
const pads = document.querySelectorAll(".pad");
const sciencePad = document.querySelector(".pad-science");
const memoryPanel = document.querySelector(".memory-panel");
const historyPanel = document.querySelector(".history");

const state = {
  expression: "0",
  cursor: 1,
  evaluated: false,
  ans: 0,
  degMode: true,
  precision: 6,
  rounding: "round",
  sound: true,
  memory: [null, null, null, null, null],
  memoryIndex: 0,
  history: [],
  toastTimer: null,
};

const operators = new Set(["+", "−", "×", "÷", "^"]);
const operatorMap = {
  "+": "+",
  "−": "-",
  "×": "*",
  "÷": "/",
  "^": "^",
};

const clickAudio = (() => {
  let audioCtx = null;
  return () => {
    if (!state.sound) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 520;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
    if (navigator.vibrate) navigator.vibrate(10);
  };
})();

const formatNumber = (value) => {
  if (value === "Error" || value === "") return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return "Error";
  const factor = Math.pow(10, state.precision);
  let rounded = number;
  if (state.rounding === "round") rounded = Math.round(number * factor) / factor;
  if (state.rounding === "floor") rounded = Math.floor(number * factor) / factor;
  if (state.rounding === "ceil") rounded = Math.ceil(number * factor) / factor;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: state.precision });
};

const syncInput = () => {
  expressionInput.value = state.expression;
  expressionInput.setSelectionRange(state.cursor, state.cursor);
};

const setExpression = (value, cursor = value.length) => {
  state.expression = value || "0";
  state.cursor = cursor;
  state.evaluated = false;
  syncInput();
  updatePreview();
};

const insertAtCursor = (text) => {
  const start = state.expression.slice(0, state.cursor);
  const end = state.expression.slice(state.cursor);
  const next = `${start}${text}${end}`;
  setExpression(next, start.length + text.length);
};

const backspace = () => {
  if (state.cursor === 0) return;
  const start = state.expression.slice(0, state.cursor - 1);
  const end = state.expression.slice(state.cursor);
  setExpression(start + end, state.cursor - 1);
};

const clearAll = () => {
  setExpression("0", 1);
  resultEl.textContent = "0";
};

const normalizeExpression = (expr) =>
  expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/ANS/g, "ans")
    .replace(/\s+/g, "");

const tokenize = (expr) => {
  const tokens = [];
  let i = 0;
  const isDigit = (ch) => /[0-9.]/.test(ch);
  while (i < expr.length) {
    const ch = expr[i];
    if (isDigit(ch)) {
      let num = ch;
      i += 1;
      while (i < expr.length && isDigit(expr[i])) {
        num += expr[i];
        i += 1;
      }
      tokens.push({ type: "number", value: Number(num) });
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let word = ch;
      i += 1;
      while (i < expr.length && /[a-z]/i.test(expr[i])) {
        word += expr[i];
        i += 1;
      }
      tokens.push({ type: "word", value: word });
      continue;
    }
    if ("+-*/^()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    return null;
  }
  return tokens;
};

const toRpn = (tokens) => {
  const output = [];
  const stack = [];
  const precedence = (op) => {
    if (op === "u-") return 4;
    if (op === "^") return 3;
    if (op === "*" || op === "/") return 2;
    return 1;
  };
  const rightAssociative = (op) => op === "^" || op === "u-";

  tokens.forEach((token, index) => {
    if (token.type === "number") {
      output.push(token);
      return;
    }
    if (token.type === "word") {
      const next = tokens[index + 1];
      if (next && next.type === "op" && next.value === "(") {
        stack.push({ type: "func", value: token.value });
      } else {
        output.push(token);
      }
      return;
    }
    if (token.type === "op") {
      let op = token.value;
      const prev = tokens[index - 1];
      const isUnary = op === "-" && (!prev || (prev.type === "op" && prev.value !== ")"));
      if (isUnary) op = "u-";
      if (op === "(") {
        stack.push(op);
        return;
      }
      if (op === ")") {
        while (stack.length && stack[stack.length - 1] !== "(") {
          const popped = stack.pop();
          output.push(popped.type ? popped : { type: "op", value: popped });
        }
        stack.pop();
        const top = stack[stack.length - 1];
        if (top && top.type === "func") {
          output.push(stack.pop());
        }
        return;
      }
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top === "(" || (top.type && top.type === "func")) break;
        const topOp = top.value ?? top;
        if (
          precedence(topOp) > precedence(op) ||
          (precedence(topOp) === precedence(op) && !rightAssociative(op))
        ) {
          const popped = stack.pop();
          output.push(popped.type ? popped : { type: "op", value: popped });
        } else {
          break;
        }
      }
      stack.push(op);
    }
  });
  while (stack.length) {
    const popped = stack.pop();
    output.push(popped.type ? popped : { type: "op", value: popped });
  }
  return output;
};

const evalRpn = (rpn, variables = {}) => {
  const stack = [];
  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }
    if (token.type === "word") {
      if (token.value === "pi") stack.push(Math.PI);
      else if (token.value === "e") stack.push(Math.E);
      else if (token.value === "ans") stack.push(state.ans);
      else if (token.value === "x") stack.push(variables.x ?? 0);
      else return null;
      continue;
    }
    if (token.type === "op") {
      if (token.value === "u-") {
        const v = stack.pop();
        stack.push(-v);
        continue;
      }
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      let result = 0;
      switch (token.value) {
        case "+":
          result = a + b;
          break;
        case "-":
          result = a - b;
          break;
        case "*":
          result = a * b;
          break;
        case "/":
          result = b === 0 ? NaN : a / b;
          break;
        case "^":
          result = Math.pow(a, b);
          break;
        default:
          return null;
      }
      stack.push(result);
    }
  }
  return stack.length ? stack[0] : null;
};

const evaluateExpressionWithFunctions = (expression, variables) => {
  const normalized = normalizeExpression(expression);
  const tokens = tokenize(normalized);
  if (!tokens) return null;
  const rpn = toRpn(tokens);
  if (!rpn) return null;
  const stack = [];
  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }
    if (token.type === "word") {
      if (token.value === "pi") stack.push(Math.PI);
      else if (token.value === "e") stack.push(Math.E);
      else if (token.value === "ans") stack.push(state.ans);
      else if (token.value === "x") stack.push(variables?.x ?? 0);
      else return null;
      continue;
    }
    if (token.type === "func") {
      const v = stack.pop();
      if (v === undefined) return null;
      if (token.value === "sqrt") stack.push(Math.sqrt(v));
      else if (["sin", "cos", "tan"].includes(token.value)) stack.push(applyTrig(v, token.value));
      else return null;
      continue;
    }
    if (token.type === "op") {
      if (token.value === "u-") {
        const v = stack.pop();
        stack.push(-v);
        continue;
      }
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      let result = 0;
      switch (token.value) {
        case "+":
          result = a + b;
          break;
        case "-":
          result = a - b;
          break;
        case "*":
          result = a * b;
          break;
        case "/":
          result = b === 0 ? NaN : a / b;
          break;
        case "^":
          result = Math.pow(a, b);
          break;
        default:
          return null;
      }
      stack.push(result);
    }
  }
  return stack.length ? stack[0] : null;
};

const updatePreview = () => {
  const value = evaluateExpressionWithFunctions(state.expression);
  if (value === null || !Number.isFinite(value)) {
    resultEl.textContent = "Error";
    return;
  }
  resultEl.textContent = formatNumber(String(value));
};

const pushHistory = (expression, result) => {
  state.history.unshift({ expression, result, ts: new Date() });
  if (state.history.length > 20) state.history.pop();
  renderHistory();
};

const renderHistory = () => {
  historyList.innerHTML = "";
  state.history.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.dataset.index = String(index);
    li.innerHTML = `<span>${item.expression}</span><strong>${formatNumber(
      String(item.result)
    )}</strong>`;
    historyList.appendChild(li);
  });
};

const evaluateNow = () => {
  const value = evaluateExpressionWithFunctions(state.expression);
  if (value === null || !Number.isFinite(value)) {
    resultEl.textContent = "Error";
    return;
  }
  state.ans = value;
  pushHistory(state.expression, value);
  setExpression(String(value), String(value).length);
  state.evaluated = true;
};

const applyFunction = (fn) => {
  insertAtCursor(`${fn}(`);
};

const handleAction = (action, value) => {
  clickAudio();
  switch (action) {
    case "digit":
      if (state.expression === "0") setExpression(value, value.length);
      else insertAtCursor(value);
      break;
    case "decimal":
      insertAtCursor(".");
      break;
    case "operator":
      insertAtCursor(` ${value} `);
      break;
    case "paren-left":
      insertAtCursor("(");
      break;
    case "paren-right":
      insertAtCursor(")");
      break;
    case "constant":
      insertAtCursor(value);
      break;
    case "function":
      applyFunction(value);
      break;
    case "equals":
      evaluateNow();
      break;
    case "clear":
      clearAll();
      break;
    case "backspace":
      backspace();
      break;
    case "percent":
      insertAtCursor("/100");
      break;
    case "toggle-sign":
      insertAtCursor("-");
      break;
    case "memory-store":
      storeMemory();
      break;
    case "memory-clear":
      clearMemory();
      break;
    case "memory-recall":
      recallMemory(value);
      break;
    case "history-clear":
      state.history = [];
      renderHistory();
      break;
    default:
      break;
  }
};

const storeMemory = () => {
  const value = evaluateExpression(state.expression);
  if (value === null || !Number.isFinite(value)) return;
  state.memory[state.memoryIndex] = value;
  state.memoryIndex = (state.memoryIndex + 1) % state.memory.length;
  renderMemory();
};

const clearMemory = () => {
  state.memory = [null, null, null, null, null];
  state.memoryIndex = 0;
  renderMemory();
};

const recallMemory = (slot) => {
  const index = Number(slot);
  const value = state.memory[index];
  if (value === null || value === undefined) return;
  insertAtCursor(String(value));
};

const renderMemory = () => {
  memorySlots.forEach((slot) => {
    const index = Number(slot.dataset.memorySlot);
    const value = state.memory[index];
    const label = value === null ? "—" : formatNumber(String(value));
    slot.querySelector("span").textContent = label;
    slot.dataset.active = value === null ? "false" : "true";
  });
};

const updateAngleMode = () => {
  state.degMode = modeToggle.dataset.mode === "deg";
  modeToggle.textContent = state.degMode ? "DEG" : "RAD";
};

const applyTrig = (value, fn) => {
  const angle = state.degMode ? (value * Math.PI) / 180 : value;
  if (fn === "sin") return Math.sin(angle);
  if (fn === "cos") return Math.cos(angle);
  if (fn === "tan") return Math.tan(angle);
  return value;
};

const updateGraph = () => {
  const ctx = graphCanvas.getContext("2d");
  const width = graphCanvas.width;
  const height = graphCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  const expr = state.expression;
  if (!expr.includes("x")) return;
  ctx.strokeStyle = "rgba(98, 182, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (let px = 0; px < width; px++) {
    const x = ((px - width / 2) / (width / 2)) * 10;
    const yVal = evaluateExpressionWithFunctions(expr, { x });
    if (!Number.isFinite(yVal)) {
      first = true;
      continue;
    }
    const py = height / 2 - (yVal / 10) * (height / 2);
    if (first) {
      ctx.moveTo(px, py);
      first = false;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
};

const updateConverterOptions = () => {
  const type = converterType.value;
  const options =
    type === "length"
      ? ["m", "km", "ft", "in", "mi"]
      : type === "temp"
      ? ["C", "F", "K"]
      : ["USD", "EUR", "GBP", "JPY", "INR"];

  converterFrom.innerHTML = "";
  converterTo.innerHTML = "";
  options.forEach((unit) => {
    const opt1 = document.createElement("option");
    opt1.value = unit;
    opt1.textContent = unit;
    const opt2 = opt1.cloneNode(true);
    converterFrom.appendChild(opt1);
    converterTo.appendChild(opt2);
  });
  converterTo.selectedIndex = 1;
};

const convertValue = () => {
  const type = converterType.value;
  const value = Number(converterInput.value);
  if (Number.isNaN(value)) {
    converterOutput.textContent = "—";
    return;
  }
  const from = converterFrom.value;
  const to = converterTo.value;
  let result = value;
  if (type === "length") {
    const toMeters = { m: 1, km: 1000, ft: 0.3048, in: 0.0254, mi: 1609.34 };
    result = (value * toMeters[from]) / toMeters[to];
  } else if (type === "temp") {
    const toC =
      from === "C"
        ? value
        : from === "F"
        ? ((value - 32) * 5) / 9
        : value - 273.15;
    result = to === "C" ? toC : to === "F" ? toC * (9 / 5) + 32 : toC + 273.15;
  } else {
    const rates = { USD: 1, EUR: 0.92, GBP: 0.78, JPY: 155, INR: 83 };
    result = (value / rates[from]) * rates[to];
  }
  converterOutput.textContent = result.toFixed(4);
};

pads.forEach((pad) => {
  pad.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const { action, value } = button.dataset;
    handleAction(action, value);
  });
});

historyList.addEventListener("click", (event) => {
  const item = event.target.closest(".history-item");
  if (!item) return;
  const entry = state.history[Number(item.dataset.index)];
  if (!entry) return;
  setExpression(String(entry.result), String(entry.result).length);
});

memoryPanel.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { action, value } = button.dataset;
  if (action) handleAction(action, value);
});

historyPanel.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { action } = button.dataset;
  if (action) handleAction(action);
});

historyExportBtn.addEventListener("click", async () => {
  const rows = ["expression,result"];
  state.history.forEach((item) => rows.push(`"${item.expression}",${item.result}`));
  const csv = rows.join("\n");
  let copied = false;
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(csv);
      copied = true;
    } catch (err) {
      // fallback to file download below
    }
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "calisto-history.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast.textContent = copied ? "History copied and downloaded." : "History downloaded.";
  toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    toast.textContent = "";
    toast.classList.remove("is-visible");
  }, 2000);
});

toggleSignBtn.addEventListener("click", () => handleAction("toggle-sign"));

themeSelect.addEventListener("change", (event) => {
  document.body.dataset.theme = event.target.value;
});

modeToggle.addEventListener("click", () => {
  modeToggle.dataset.mode = modeToggle.dataset.mode === "deg" ? "rad" : "deg";
  updateAngleMode();
  updatePreview();
  updateGraph();
});

precisionSelect.addEventListener("change", (event) => {
  state.precision = Number(event.target.value);
  updatePreview();
  renderMemory();
});

roundingSelect.addEventListener("change", (event) => {
  state.rounding = event.target.value;
  updatePreview();
  renderMemory();
});

soundToggle.addEventListener("click", () => {
  state.sound = !state.sound;
  soundToggle.dataset.active = state.sound ? "true" : "false";
  soundToggle.textContent = state.sound ? "Sound On" : "Sound Off";
});

scienceToggle.classList.add("is-green");
scienceToggle.addEventListener("click", () => {
  const isOpen = scienceToggle.dataset.open === "true";
  scienceToggle.dataset.open = isOpen ? "false" : "true";
  scienceToggle.textContent = isOpen ? "Science Off" : "Science";
  sciencePad.classList.toggle("is-collapsed", isOpen);
});

expressionInput.addEventListener("input", () => {
  const value = expressionInput.value.trim();
  if (value === "") {
    setExpression("0", 1);
    return;
  }
  state.expression = expressionInput.value;
  state.cursor = expressionInput.selectionStart ?? state.expression.length;
  updatePreview();
  updateGraph();
});

expressionInput.addEventListener("click", () => {
  state.cursor = expressionInput.selectionStart ?? state.expression.length;
});

expressionInput.addEventListener("keyup", () => {
  state.cursor = expressionInput.selectionStart ?? state.expression.length;
});

converterType.addEventListener("change", () => {
  updateConverterOptions();
  convertValue();
});

[converterInput, converterFrom, converterTo].forEach((el) => {
  el.addEventListener("input", convertValue);
  el.addEventListener("change", convertValue);
});

window.addEventListener("keydown", (event) => {
  const keyMap = {
    "+": "+",
    "-": "−",
    "*": "×",
    "/": "÷",
    "^": "^",
  };
  if (event.key >= "0" && event.key <= "9") {
    handleAction("digit", event.key);
    return;
  }
  if (event.key === ".") {
    handleAction("decimal");
    return;
  }
  if (keyMap[event.key]) {
    handleAction("operator", keyMap[event.key]);
    return;
  }
  if (event.key === "Enter" || event.key === "=") {
    handleAction("equals");
    return;
  }
  if (event.key === "Backspace") {
    handleAction("backspace");
  }
});

document.body.dataset.theme = "solar";
state.precision = Number(precisionSelect.value);
state.rounding = roundingSelect.value;
syncInput();
updateAngleMode();
updatePreview();
renderMemory();
renderHistory();
updateConverterOptions();
convertValue();
updateGraph();
