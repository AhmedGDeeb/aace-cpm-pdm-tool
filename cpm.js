/* ============================================================
   CPM math — calendar-day semantics with LAG and per-task startDay.

   Calendar-day convention:
     Forward:   EF = ES + Duration - 1
     Backward:  LS = LF - Duration + 1
     Float  =   LS - ES   (= LF - EF)

   Tasks: [{ id, name, duration, startDay? }]
   Deps:  [{ from, to, type, lag }]

   Constraint formulas:
     FS — successor starts lag days after predecessor finishes
     SS — successor starts lag days after predecessor starts
     FF — successor finishes lag days after predecessor finishes
     SF — successor finishes lag days after predecessor starts
   ============================================================ */

function calculateCPM(tasks, deps) {
  const map = {};
  tasks.forEach(t => {
    map[t.id] = {
      id: t.id,
      name: t.name,
      duration: t.duration,
      startDay: (t.startDay != null) ? t.startDay : 0,
      preds: [], succs: [],
      ES: 0, EF: 0, LS: 0, LF: 0, float: 0, critical: false
    };
  });

  deps.forEach(d => {
    if (map[d.from] && map[d.to]) {
      const lag = d.lag || 0;
      map[d.to].preds.push({ id: d.from, type: d.type || 'FS', lag });
      map[d.from].succs.push({ id: d.to, type: d.type || 'FS', lag });
    }
  });

  const order = topoSort(map);
  if (!order) return { error: 'Cycle detected in dependencies', map };

  // ---- Forward pass ----
  //   ES = max( startDay, predecessor constraints )
  //   EF = ES + Duration - 1
  order.forEach(id => {
    const t = map[id];
    const D = t.duration;

    let ES = t.startDay;

    t.preds.forEach(p => {
      const pT = map[p.id];
      let cand;
      if (p.type === 'FS') {
        cand = pT.EF + 1 + p.lag;
      } else if (p.type === 'SS') {
        cand = pT.ES + p.lag;
      } else if (p.type === 'FF') {
        // Successor must finish lag days after predecessor finishes.
        cand = pT.EF + p.lag - D + 1;
      } else if (p.type === 'SF') {
        // Successor must finish lag days after predecessor starts.
        cand = pT.ES + p.lag - D + 1;
      } else {
        cand = pT.EF + 1 + p.lag;
      }
      ES = Math.max(ES, cand);
    });

    t.ES = ES;
    t.EF = ES + D - 1;
  });

  const projectEnd = Math.max(0, ...Object.values(map).map(t => t.EF));

  // ---- Backward pass ----
  //   LS = LF - Duration + 1
  [...order].reverse().forEach(id => {
    const t = map[id];
    const D = t.duration;

    let LF = t.succs.length === 0 ? projectEnd : Infinity;

    t.succs.forEach(s => {
      const sT = map[s.id];
      let cand;
      if (s.type === 'FS') {
        cand = sT.LS - 1 - s.lag;
      } else if (s.type === 'SS') {
        cand = sT.LS - s.lag + D - 1;
      } else if (s.type === 'FF') {
        cand = sT.LF - s.lag;
      } else if (s.type === 'SF') {
        cand = sT.LF - s.lag + D - 1;
      } else {
        cand = sT.LS - 1 - s.lag;
      }
      LF = Math.min(LF, cand);
    });

    if (!isFinite(LF)) LF = projectEnd;

    // LF must never be earlier than the task's own minimum window
    LF = Math.max(LF, t.startDay + D - 1);

    t.LF = LF;
    t.LS = LF - D + 1;
    t.float = t.LS - t.ES;
  });

  // ---- Critical flag ----
  Object.values(map).forEach(t => {
    t.critical = Math.abs(t.float) < 0.001;
  });

  return {
    map,
    projectDuration: projectEnd,
    criticalPath: getCriticalPath(map)
  };
}

function topoSort(map) {
  const inDeg = {}, order = [], queue = [];
  Object.keys(map).forEach(id => {
    inDeg[id] = map[id].preds.length;
    if (inDeg[id] === 0) queue.push(id);
  });
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    map[id].succs.forEach(s => {
      inDeg[s.id]--;
      if (inDeg[s.id] === 0) queue.push(s.id);
    });
  }
  return order.length === Object.keys(map).length ? order : null;
}

function getCriticalPath(map) {
  return Object.values(map)
    .filter(t => t.critical)
    .map(t => t.id)
    .sort((a, b) => map[a].ES - map[b].ES);
}