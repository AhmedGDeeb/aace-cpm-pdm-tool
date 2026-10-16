/* ============================================================
   STATE
   ============================================================ */
const state = {
  projectName: 'Project Paths with Lags',
  tasks: [],          // { id, name, duration, startDay?, x, y, _userSet? }
  deps: [],           // { from, to, type, lag }
  selectedTask: null,
  linkMode: false,
  linkFrom: null,
  highlightCritical: true,
  startAtDay1: false,
  lastLag: 0,         // remembers the last-used lag for the Properties input
  nextId: 1
};

// PDM node dimensions (AACE-style box)
const NODE_W = 160;
const NODE_HEAD_H = 22;
const NODE_ROW_H = 22;
const NODE_H = NODE_HEAD_H + NODE_ROW_H * 2;   // 66

/* ============================================================
   INIT
   ============================================================ */
function init() {
  bindUI();

  const saved = Storage.load();
  if (saved) {
    Object.assign(state, saved);
    setStatus('Loaded from localStorage');
    document.getElementById('chkShiftDay').checked = !!state.startAtDay1;
  } else {
    state.startAtDay1 = true;
    document.getElementById('chkShiftDay').checked = true;
    buildDemoProject();
  }
  render();
}

// AACE "Project Paths with Lags" demo
//   Day 1 is the first working day.
//   A(4) → B(2) → D(4) → E(3)   critical path
//   A(4) → C(5) → E(3)          near-critical
//   B → D has lag 3
//   C → E has lag 2
function buildDemoProject() {
  const A = addTask('A', 4, 80,  240);
  const B = addTask('B', 2, 320, 100);
  const C = addTask('C', 5, 320, 380);
  const D = addTask('D', 4, 560, 100);
  const E = addTask('E', 3, 800, 240);

  // Every task starts no earlier than day 1
  [A, B, C, D, E].forEach(id => {
    const t = state.tasks.find(x => x.id === id);
    if (t) t.startDay = 1;
  });

  linkTasks(A, B, 'FS', 0);
  linkTasks(A, C, 'FS', 0);
  linkTasks(B, D, 'FS', 3);
  linkTasks(C, E, 'FS', 2);
  linkTasks(D, E, 'FS', 0);
}

/* ============================================================
   DAY-SHIFT HELPER
   ============================================================ */
// Only shifts tasks that the user has NOT manually edited.
function applyDayShift() {
  state.tasks.forEach(t => {
    if (t._userSet) return;   // respect manual edits
    t.startDay = state.startAtDay1 ? 1 : 0;
  });
}

/* ============================================================
   UI BINDINGS
   ============================================================ */
function bindUI() {
  document.getElementById('btnAddTask').addEventListener('click', () => {
    const x = 80 + (state.tasks.length % 5) * 220;
    const y = 80 + Math.floor(state.tasks.length / 5) * 140;
    addTask('T' + (state.tasks.length + 1), 3, x, y);
    render();
  });

  document.getElementById('btnLink').addEventListener('click', (e) => {
    state.linkMode = !state.linkMode;
    state.linkFrom = null;
    e.target.classList.toggle('active', state.linkMode);
    setStatus(state.linkMode
      ? 'Link mode: click source task, then target task'
      : 'Link mode off');
    render();
  });

  document.getElementById('btnAuto').addEventListener('click', () => {
    autoLayout();
    render();
  });

  document.getElementById('chkCritical').addEventListener('change', (e) => {
    state.highlightCritical = e.target.checked;
    render();
  });

  document.getElementById('chkShiftDay').addEventListener('change', (e) => {
    state.startAtDay1 = e.target.checked;
    applyDayShift();
    render();
    setStatus(state.startAtDay1
      ? 'Every task now starts at Day 1 or later'
      : 'Day shift removed (tasks can start at Day 0)');
  });

  document.getElementById('projectName').addEventListener('input', (e) => {
    state.projectName = e.target.value;
  });

  document.getElementById('btnClear').addEventListener('click', () => {
    if (!confirm('Clear the entire project?')) return;
    state.tasks = [];
    state.deps = [];
    state.selectedTask = null;
    state.nextId = 1;
    Storage.clear();
    render();
    setStatus('Project cleared');
  });

  document.getElementById('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({
      projectName: state.projectName,
      tasks: state.tasks,
      deps: state.deps,
      startAtDay1: state.startAtDay1
    }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.projectName || 'project') + '.json';
    a.click();
  });
}

/* ============================================================
   TASK / DEP OPERATIONS
   ============================================================ */
function addTask(name, duration, x, y) {
  const id = state.nextId++;
  state.tasks.push({
    id, name, duration, x, y,
    startDay: state.startAtDay1 ? 1 : 0
  });
  return id;
}

function linkTasks(from, to, type = 'FS', lag = 0) {
  if (from === to) return;
  if (state.deps.some(d => d.from === from && d.to === to)) return;
  if (wouldCreateCycle(from, to)) return;
  state.deps.push({ from, to, type, lag });
}

function wouldCreateCycle(from, to) {
  const stack = [to], visited = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === from) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    state.deps.filter(d => d.from === cur).forEach(d => stack.push(d.to));
  }
  return false;
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  state.deps = state.deps.filter(d => d.from !== id && d.to !== id);
  if (state.selectedTask === id) state.selectedTask = null;
}

function deleteDep(from, to) {
  state.deps = state.deps.filter(d => !(d.from === from && d.to === to));
}

/* ============================================================
   AUTO LAYOUT — columns by ES, rows within column
   ============================================================ */
function autoLayout() {
  const { map } = calculateCPM(state.tasks, state.deps);
  if (!map) return;

  const cols = {};
  Object.values(map).forEach(t => {
    const key = t.ES;
    if (!cols[key]) cols[key] = [];
    cols[key].push(t);
  });
  const sortedKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
  const colW = NODE_W + 80;
  const rowH = NODE_H + 70;
  sortedKeys.forEach((key, ci) => {
    cols[key].forEach((t, ri) => {
      const task = state.tasks.find(x => x.id === t.id);
      task.x = 80 + ci * colW;
      task.y = 80 + ri * rowH;
    });
  });
}

/* ============================================================
   RENDER — top level
   ============================================================ */
function render() {
  const result = calculateCPM(state.tasks, state.deps);
  renderTaskList(result.map);
  renderProps();
  renderResults(result);
  renderPDM(result.map);
}

/* ============================================================
   TASK LIST
   ============================================================ */
function renderTaskList(cpmMap) {
  const ul = document.getElementById('taskList');
  ul.innerHTML = '';
  state.tasks.forEach(t => {
    const info = cpmMap ? cpmMap[t.id] : null;
    const li = document.createElement('li');
    li.className =
      (state.selectedTask === t.id ? 'selected ' : '') +
      (info && info.critical && state.highlightCritical ? 'critical' : '');
    li.innerHTML =
      `<span class="dot"></span>${escapeHtml(t.name)}` +
      `<span class="dur">${t.duration}d</span>`;
    li.addEventListener('click', () => {
      state.selectedTask = t.id;
      render();
    });
    ul.appendChild(li);
  });
}

/* ============================================================
   PROPERTIES
   ============================================================ */
function renderProps() {
  const el = document.getElementById('propsContent');
  const t = state.tasks.find(x => x.id === state.selectedTask);
  if (!t) {
    el.innerHTML = '<em>Select a task</em>';
    return;
  }
  const sd = (t.startDay != null) ? t.startDay : 0;

  el.innerHTML = `
    <label>Name</label>
    <input id="pName" value="${escapeAttr(t.name)}">

    <label>Duration (days)</label>
    <input id="pDur" type="number" min="0" step="1" value="${t.duration}">

    <label>Minimum Start Day (startDay)</label>
    <input id="pStart" type="number" min="0" step="1" value="${sd}">
    <div class="note">Task will not start before this day.
      Manually editing this pins the task against the global Day-1 toggle.</div>

    <label>Add Predecessor</label>
    <div class="row">
      <select id="pPred">
        ${state.tasks.filter(x => x.id !== t.id).map(x =>
          `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('')}
      </select>
      <select id="pPredType">
        <option>FS</option><option>SS</option><option>FF</option><option>SF</option>
      </select>
      <button id="pAddPred">+</button>
    </div>

    <label>Lag (days)</label>
    <input id="pLag" type="number" min="0" step="1" value="${state.lastLag || 0}">

    <label>Existing Predecessors</label>
    <div style="font-size:12px">
      ${
        state.deps.filter(d => d.to === t.id).map(d => {
          const src = state.tasks.find(x => x.id === d.from);
          const lag = d.lag ? ` lag ${d.lag}` : '';
          return `<div>← ${escapeHtml(src.name)}
            <small style="color:var(--muted)">(${d.type}${lag})</small>
            <button data-del="${d.from}" style="padding:0 6px;font-size:11px">×</button></div>`;
        }).join('') || '<em style="color:#888">none</em>'
      }
    </div>

    <button class="danger" id="pDelete">Delete Task</button>
  `;

  el.querySelector('#pName').addEventListener('input', e => {
    t.name = e.target.value;
    render();
  });
  el.querySelector('#pDur').addEventListener('input', e => {
    t.duration = Math.max(0, Number(e.target.value) || 0);
    render();
  });
  el.querySelector('#pStart').addEventListener('input', e => {
    t.startDay = Math.max(0, Number(e.target.value) || 0);
    t._userSet = true;   // pin against the global day-shift toggle
    render();
  });
  el.querySelector('#pLag').addEventListener('input', e => {
    state.lastLag = Math.max(0, Number(e.target.value) || 0);
  });
  el.querySelector('#pAddPred').addEventListener('click', () => {
    const from = Number(el.querySelector('#pPred').value);
    const type = el.querySelector('#pPredType').value;
    const lag  = Math.max(0, Number(el.querySelector('#pLag').value) || 0);
    state.lastLag = lag;
    linkTasks(from, t.id, type, lag);
    render();
  });
  el.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', () => {
      deleteDep(Number(b.dataset.del), t.id);
      render();
    });
  });
  el.querySelector('#pDelete').addEventListener('click', () => {
    deleteTask(t.id);
    render();
  });
}

/* ============================================================
   RESULTS
   ============================================================ */
function renderResults(result) {
  const el = document.getElementById('results');
  if (result.error) {
    el.innerHTML = `<div style="color:#ff4d4d">${result.error}</div>`;
    return;
  }
  const cp = result.criticalPath || [];
  el.innerHTML = `
    <div class="kv"><span>Tasks</span><span>${state.tasks.length}</span></div>
    <div class="kv"><span>Dependencies</span><span>${state.deps.length}</span></div>
    <div class="kv"><span>Project Duration</span><span>${result.projectDuration || 0} days</span></div>
    <div class="kv"><span>Project Finish Day</span><span>${result.projectDuration || 0}</span></div>
    <div class="kv"><span>Critical Tasks</span><span>${cp.length}</span></div>
    <div style="margin-top:8px">
      <span style="color:var(--muted);font-size:12px">Critical Path:</span>
      <div class="cp">
        ${cp.map(id => escapeHtml(state.tasks.find(t => t.id === id).name)).join(' → ') || '—'}
      </div>
    </div>
  `;
}

/* ============================================================
   PDM VIEW (AACE-style nodes)
   ============================================================ */
function renderPDM(cpmMap) {
  const svg = document.getElementById('canvas');
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';

  svg.innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
        markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#888"/>
      </marker>
      <marker id="arrow-crit" viewBox="0 0 10 10" refX="10" refY="5"
        markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff4d4d"/>
      </marker>
    </defs>`;

  // Auto-size
  let maxX = 900, maxY = 600;
  state.tasks.forEach(t => {
    maxX = Math.max(maxX, t.x + NODE_W + 120);
    maxY = Math.max(maxY, t.y + NODE_H + 120);
  });
  svg.setAttribute('width', maxX);
  svg.setAttribute('height', maxY);
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);

  // ---- Edges first (behind nodes) ----
  state.deps.forEach(d => {
    const from = state.tasks.find(t => t.id === d.from);
    const to   = state.tasks.find(t => t.id === d.to);
    if (!from || !to) return;

    const p1 = edgePoint(from, to);
    const p2 = edgePoint(to, from);
    const isCrit = state.highlightCritical &&
                   cpmMap[d.from]?.critical && cpmMap[d.to]?.critical;

    const g = document.createElementNS(ns, 'g');

    const hit = document.createElementNS(ns, 'path');
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('d', orthoPath(p1, p2));
    hit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete dependency ${from.name} → ${to.name}?`)) {
        deleteDep(d.from, d.to);
        render();
      }
    });

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('class', 'edge' + (isCrit ? ' critical' : ''));
    path.setAttribute('d', orthoPath(p1, p2));
    path.setAttribute('marker-end', isCrit ? 'url(#arrow-crit)' : 'url(#arrow)');

    g.appendChild(hit);
    g.appendChild(path);
    svg.appendChild(g);

    // Lag pill
    if (d.lag && d.lag !== 0) {
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const label = `lag ${d.lag}`;
      const w = label.length * 6.5 + 10;

      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', mx - w / 2);
      r.setAttribute('y', my - 9);
      r.setAttribute('width', w);
      r.setAttribute('height', 16);
      r.setAttribute('rx', 3);
      r.setAttribute('fill', '#20222e');
      r.setAttribute('stroke', '#666');
      svg.appendChild(r);

      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', mx);
      t.setAttribute('y', my + 3);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '10');
      t.setAttribute('fill', '#ccc');
      t.textContent = label;
      svg.appendChild(t);
    }
  });

  // ---- Nodes ----
  state.tasks.forEach(t => {
    const info = cpmMap[t.id] || {};
    const critical = info.critical && state.highlightCritical;

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class',
      'node' +
      (critical ? ' critical' : '') +
      (state.selectedTask === t.id ? ' selected' : ''));
    g.setAttribute('transform', `translate(${t.x},${t.y})`);

    const box = document.createElementNS(ns, 'rect');
    box.setAttribute('class', 'box-outer');
    box.setAttribute('width', NODE_W);
    box.setAttribute('height', NODE_H);
    box.setAttribute('rx', 6);
    g.appendChild(box);

    const head = document.createElementNS(ns, 'rect');
    head.setAttribute('class', 'head');
    head.setAttribute('x', 1);
    head.setAttribute('y', 1);
    head.setAttribute('width', NODE_W - 2);
    head.setAttribute('height', NODE_HEAD_H - 1);
    head.setAttribute('rx', 5);
    g.appendChild(head);

    const idTxt = document.createElementNS(ns, 'text');
    idTxt.setAttribute('class', 'id-text');
    idTxt.setAttribute('x', 8);
    idTxt.setAttribute('y', NODE_HEAD_H - 7);
    idTxt.textContent = t.name;
    g.appendChild(idTxt);

    const durTxt = document.createElementNS(ns, 'text');
    durTxt.setAttribute('class', 'dur-text');
    durTxt.setAttribute('x', NODE_W - 8);
    durTxt.setAttribute('y', NODE_HEAD_H - 7);
    durTxt.setAttribute('text-anchor', 'end');
    durTxt.textContent = `Dur ${t.duration}`;
    g.appendChild(durTxt);

    const topLine = document.createElementNS(ns, 'line');
    topLine.setAttribute('class', 'cell-line');
    topLine.setAttribute('x1', 1);
    topLine.setAttribute('y1', NODE_HEAD_H);
    topLine.setAttribute('x2', NODE_W - 1);
    topLine.setAttribute('y2', NODE_HEAD_H);
    g.appendChild(topLine);

    const midY = NODE_HEAD_H + NODE_ROW_H;
    const hline = document.createElementNS(ns, 'line');
    hline.setAttribute('class', 'cell-line');
    hline.setAttribute('x1', 1);
    hline.setAttribute('y1', midY);
    hline.setAttribute('x2', NODE_W - 1);
    hline.setAttribute('y2', midY);
    g.appendChild(hline);

    const vline = document.createElementNS(ns, 'line');
    vline.setAttribute('class', 'cell-line');
    vline.setAttribute('x1', NODE_W / 2);
    vline.setAttribute('y1', NODE_HEAD_H);
    vline.setAttribute('x2', NODE_W / 2);
    vline.setAttribute('y2', NODE_H);
    g.appendChild(vline);

    drawCell(g, ns, 0, NODE_HEAD_H, NODE_W / 2, NODE_ROW_H, 'ES', info.ES);
    drawCell(g, ns, NODE_W / 2, NODE_HEAD_H, NODE_W / 2, NODE_ROW_H, 'EF', info.EF);
    drawCell(g, ns, 0, midY, NODE_W / 2, NODE_ROW_H, 'LS', info.LS);
    drawCell(g, ns, NODE_W / 2, midY, NODE_W / 2, NODE_ROW_H, 'LF', info.LF);

    svg.appendChild(g);

    g.addEventListener('mousedown', (e) => {
      if (state.linkMode) return;
      e.preventDefault();

      const startX = e.clientX, startY = e.clientY;
      const origX = t.x, origY = t.y;
      let moved = false;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        t.x = origX + dx;
        t.y = origY + dy;
        g.setAttribute('transform', `translate(${t.x},${t.y})`);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (moved) render();
        else handleNodeClick(t);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  svg.addEventListener('click', (e) => {
    if (e.target === svg) {
      state.selectedTask = null;
      state.linkFrom = null;
      render();
    }
  });
}

/* ============================================================
   HELPERS
   ============================================================ */

function drawCell(g, ns, x, y, w, h, label, value) {
  const lbl = document.createElementNS(ns, 'text');
  lbl.setAttribute('class', 'lbl');
  lbl.setAttribute('x', x + w / 2);
  lbl.setAttribute('y', y + 10);
  lbl.textContent = label;
  g.appendChild(lbl);

  const val = document.createElementNS(ns, 'text');
  val.setAttribute('class', 'val');
  val.setAttribute('x', x + w / 2);
  val.setAttribute('y', y + h - 5);
  val.textContent = (value ?? 0);
  g.appendChild(val);
}

function orthoPath(p1, p2) {
  const midX = (p1.x + p2.x) / 2;
  return `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`;
}

function edgePoint(from, to) {
  const fx = from.x + NODE_W / 2, fy = from.y + NODE_H / 2;
  const tx = to.x + NODE_W / 2,   ty = to.y + NODE_H / 2;
  const dx = tx - fx, dy = ty - fy;
  if (dx === 0 && dy === 0) return { x: fx, y: fy };
  const halfW = NODE_W / 2, halfH = NODE_H / 2;
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const s = Math.min(scaleX, scaleY);
  return { x: fx + dx * s, y: fy + dy * s };
}

function handleNodeClick(t) {
  if (state.linkMode) {
    if (!state.linkFrom) {
      state.linkFrom = t.id;
      setStatus(`Linking from ${t.name}: click target task`);
    } else if (state.linkFrom === t.id) {
      state.linkFrom = null;
      setStatus('Link cancelled');
    } else {
      linkTasks(state.linkFrom, t.id, 'FS', 0);
      state.linkFrom = null;
      setStatus('Dependency created');
    }
    render();
  } else {
    state.selectedTask = t.id;
    render();
  }
}

function setStatus(msg) {
  const el = document.getElementById('statusText');
  if (el) el.textContent = msg;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function escapeAttr(s) { return escapeHtml(s); }

/* ============================================================
   GO!
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  init();

  // Fill in the current year in the footer
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
});