/* Bean & Brew — a barista game. Vanilla JS, no dependencies. */
'use strict';
(function () {

  /* ── helpers ──────────────────────────────────────────── */

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const money = (n) => '$' + n.toFixed(2);

  // mulberry32 — small seedable RNG so a test run can be reproduced
  let rngState = (Date.now() ^ 0x9e3779b9) >>> 0;
  function rnd() {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rndRange = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[(rnd() * arr.length) | 0];

  // 1.0 dead centre, 0.55 at the band edge, decaying to 0 outside it
  function bandScore(value, centre, half) {
    const d = Math.abs(value - centre);
    if (d <= half) return 1 - 0.45 * (d / half);
    return Math.max(0, 0.55 - (0.55 * (d - half)) / (half * 3));
  }

  /* ── persistence (write-through, memory is the source of truth) ── */

  const Store = (function () {
    const KEY = 'beanandbrew.v1';
    let mem = { bestDay: 0, bestCash: 0, sound: true };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') mem = Object.assign(mem, parsed);
      }
    } catch (e) { /* storage unavailable — run from memory */ }
    function flush() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} }
    return {
      get(k) { return mem[k]; },
      set(k, v) { mem[k] = v; flush(); }
    };
  })();

  /* ── sound ────────────────────────────────────────────── */

  const Sound = {
    ctx: null,
    on: Store.get('sound') !== false,
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch (e) { return; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type, vol) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.09, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    grind()  { this.tone(90 + rnd() * 30, 0.05, 'sawtooth', 0.03); },
    click()  { this.tone(620, 0.07, 'triangle', 0.07); },
    good()   { this.tone(660, 0.1, 'sine', 0.09); setTimeout(() => this.tone(990, 0.16, 'sine', 0.08), 90); },
    great()  { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, 'sine', 0.08), i * 70)); },
    bad()    { this.tone(180, 0.22, 'square', 0.06); },
    coin()   { this.tone(1180, 0.09, 'triangle', 0.06); },
    walkout(){ this.tone(240, 0.18, 'sawtooth', 0.05); setTimeout(() => this.tone(150, 0.28, 'sawtooth', 0.05), 140); }
  };

  /* ── content ──────────────────────────────────────────── */

  const EXTRAS = [
    { id: 'water',  label: 'Hot water', ic: '💧' },
    { id: 'milk',   label: 'Cold milk', ic: '🥛' },
    { id: 'ice',    label: 'Ice',       ic: '🧊' },
    { id: 'choc',   label: 'Chocolate', ic: '🍫' },
    { id: 'caramel',label: 'Caramel',   ic: '🍯' },
    { id: 'vanilla',label: 'Vanilla',   ic: '🌼' },
    { id: 'cinn',   label: 'Cinnamon',  ic: '🌰' }
  ];
  const EXTRA_LABEL = {};
  EXTRAS.forEach((e) => { EXTRA_LABEL[e.id] = e.label; });

  // foam: how deep the wand should sit — each drink has its own feel
  const DRINKS = [
    { id:'espresso',  name:'Espresso',          shots:1, milk:null,    extras:[],                      price:3.00, from:1 },
    { id:'americano', name:'Americano',         shots:1, milk:null,    extras:['water'],               price:3.60, from:1 },
    { id:'latte',     name:'Latte',             shots:1, milk:'thin',  extras:[],                      price:4.60, from:1 },
    { id:'doppio',    name:'Doppio',            shots:2, milk:null,    extras:[],                      price:3.80, from:2 },
    { id:'cappuccino',name:'Cappuccino',        shots:1, milk:'thick', extras:[],                      price:4.60, from:2 },
    { id:'flatwhite', name:'Flat White',        shots:2, milk:'micro', extras:[],                      price:5.20, from:3 },
    { id:'mocha',     name:'Mocha',             shots:1, milk:'thin',  extras:['choc'],                price:5.40, from:3 },
    { id:'icedlatte', name:'Iced Latte',        shots:1, milk:null,    extras:['ice','milk'],          price:5.00, from:4 },
    { id:'macchiato', name:'Caramel Macchiato', shots:1, milk:'thick', extras:['caramel','vanilla'],   price:5.80, from:5 },
    { id:'cinnacap',  name:'Cinnamon Cappuccino',shots:1,milk:'thick', extras:['cinn'],                price:5.40, from:6 },
    { id:'icedmocha', name:'Iced Mocha',        shots:2, milk:null,    extras:['ice','milk','choc'],   price:6.20, from:7 }
  ];
  const FOAM_DEPTH = { thin: 0.34, micro: 0.5, thick: 0.66 };
  const FOAM_WORD  = { thin: 'thin foam', micro: 'micro foam', thick: 'thick foam' };

  const FACES = ['🧑','👩','🧔','👵','🧑‍🎓','👨‍🎨','👩‍💼','🧑‍🚀','👴','👩‍🔬','🧑‍🍳','👨‍💻','👩‍🎤','🧕'];
  const NAMES = ['Mina','Jules','Theo','Rosa','Ike','Nadia','Ben','Yuki','Omar','Lena','Cass','Pim','Dev','Ada','Kwame','Sora'];

  const UPGRADES = [
    { id:'grinder', ic:'⚙️',  name:'Burr Grinder',    desc:'Wider dose window' },
    { id:'basket',  ic:'🔩',  name:'Precision Basket', desc:'Wider crema window' },
    { id:'wand',    ic:'💨',  name:'Pro Steam Wand',   desc:'Calmer, wider sweet spot' },
    { id:'seats',   ic:'🪑',  name:'Comfy Seating',    desc:'+15% patience per level' },
    { id:'sign',    ic:'💡',  name:'Neon Sign',        desc:'+20% tips per level' }
  ];
  const UPG_COST = [26, 58, 115];
  const UPG_MAX = 3;

  /* ── state ────────────────────────────────────────────── */

  const state = {
    phase: 'menu',           // menu | playing | dayend | over
    day: 1,
    cash: 0,
    rep: 70,
    earned: 0,
    rent: 0,
    dayCustomers: 0,
    spawned: 0,
    served: 0,
    walkouts: 0,
    streak: 0,
    totalEarned: 0,
    spawnTimer: 1.2,
    queue: [],
    queueVersion: 0,
    upg: { grinder: 0, basket: 0, wand: 0, seats: 0, sign: 0 },
    step: 'idle',            // idle | grind | extract | steam | finish
    build: null,
    mini: null,
    keys: { left: false, right: false },
    nextId: 1
  };

  /* ── difficulty ───────────────────────────────────────── */

  const diff = () => clamp((state.day - 1) / 9, 0, 1);

  function grindParams() {
    const d = diff();
    return {
      centre: rndRange(0.42, 0.76),
      half: (0.085 - 0.036 * d) * (1 + 0.20 * state.upg.grinder),
      speed: 0.42 + 0.16 * d
    };
  }
  function extractParams() {
    const d = diff();
    return {
      centre: rndRange(0.28, 0.72),
      half: (0.072 - 0.030 * d) * (1 + 0.22 * state.upg.basket),
      speed: 0.72 + 0.62 * d
    };
  }
  function steamParams(drink) {
    const d = diff();
    return {
      base: FOAM_DEPTH[drink.milk] || 0.5,
      half: (0.100 - 0.040 * d) * (1 + 0.18 * state.upg.wand),
      w1: (1.5 + 0.9 * d) * (1 - 0.12 * state.upg.wand),
      w2: (2.7 + 1.5 * d) * (1 - 0.12 * state.upg.wand),
      phase: rndRange(0, 6.283),
      dur: 3.6,
      wandSpeed: 1.5 + 0.12 * state.upg.wand
    };
  }
  function patienceFor(drink) {
    const d = diff();
    let base = 30 - 11 * d;
    base += 3.5 * (drink.shots - 1);
    if (drink.milk) base += 5;
    base += 2.2 * drink.extras.length;
    return base * (1 + 0.15 * state.upg.seats);
  }

  /* ── DOM ──────────────────────────────────────────────── */

  const dom = {
    statDay: $('statDay'), statEarned: $('statEarned'), statRent: $('statRent'),
    statCash: $('statCash'), streakWrap: $('statStreakWrap'), statStreak: $('statStreak'),
    repFill: $('repFill'), repbar: document.querySelector('.repbar'),
    btnSound: $('btnSound'),
    queue: $('queue'), queueEmpty: $('queueEmpty'), queueNote: $('queueNote'),
    panels: {
      idle: $('panelIdle'), grind: $('panelGrind'), extract: $('panelExtract'),
      steam: $('panelSteam'), finish: $('panelExtras')
    },
    grindBand: $('grindBand'), grindFill: $('grindFill'), grindNeedle: $('grindNeedle'),
    grindDose: $('grindDose'), btnGrind: $('btnGrind'),
    extractBand: $('extractBand'), extractMarker: $('extractMarker'),
    shotCount: $('shotCount'), shotDots: $('shotDots'), btnExtract: $('btnExtract'),
    steamTrack: $('steamTrack'), steamBand: $('steamBand'), steamWand: $('steamWand'),
    steamTimer: $('steamTimer'), steamHint: $('steamHint'), panelSteam: $('panelSteam'),
    extras: $('extras'), btnServe: $('btnServe'), btnBin: $('btnBin'),
    steprail: $('steprail'),
    ticket: $('ticket'), ticketFor: $('ticketFor'), ticketPrice: $('ticketPrice'),
    ticketDrink: $('ticketDrink'), ticketSteps: $('ticketSteps'),
    lyrEspresso: $('lyrEspresso'), lyrMilk: $('lyrMilk'), lyrFoam: $('lyrFoam'),
    cupIce: $('cupIce'), cupCaption: $('cupCaption'), cupLiquid: $('cupLiquid'),
    toasts: $('toasts'),
    overlay: $('overlay'), sheetMenu: $('sheetMenu'), sheetDay: $('sheetDay'), sheetOver: $('sheetOver'),
    btnStart: $('btnStart'), btnNextDay: $('btnNextDay'), btnRetry: $('btnRetry'),
    bestLine: $('bestLine'), dayTitle: $('dayTitle'), dayKicker: $('dayKicker'),
    books: $('books'), shop: $('shop'), overTitle: $('overTitle'),
    overReason: $('overReason'), overBooks: $('overBooks')
  };

  /* ── extras UI ────────────────────────────────────────── */

  EXTRAS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'extra';
    b.dataset.id = e.id;
    b.innerHTML = '<span class="extra-ic">' + e.ic + '</span><span class="extra-l">' + e.label + '</span>';
    b.addEventListener('click', () => toggleExtra(e.id));
    dom.extras.appendChild(b);
  });

  function toggleExtra(id) {
    if (state.step !== 'finish' || !state.build) return;
    const set = state.build.extras;
    if (set.has(id)) set.delete(id); else set.add(id);
    Sound.unlock(); Sound.click();
    renderExtras();
    renderCup();
  }
  function renderExtras() {
    const set = state.build ? state.build.extras : new Set();
    dom.extras.querySelectorAll('.extra').forEach((b) => {
      b.classList.toggle('on', set.has(b.dataset.id));
    });
  }

  /* ── day / customers ──────────────────────────────────── */

  function startDay() {
    state.phase = 'playing';
    state.earned = 0;
    state.served = 0;
    state.walkouts = 0;
    state.spawned = 0;
    state.dayCustomers = Math.min(20, 5 + state.day);
    state.rent = Math.round(12 + (state.day - 1) * 8.5);
    state.spawnTimer = 0.8;
    state.queue.length = 0;
    state.queueVersion++;
    state.build = null;
    state.mini = null;
    state.step = 'idle';
    dom.overlay.hidden = true;
    resetClock();
    renderAll();
  }

  function menuFor(day) {
    const pool = DRINKS.filter((d) => d.from <= day);
    // bias towards the newer, pricier drinks as the days go on
    return rnd() < 0.55 ? pick(pool) : pick(pool.slice(-Math.min(pool.length, 5)));
  }

  function spawnCustomer() {
    const drink = menuFor(state.day);
    const pat = patienceFor(drink);
    state.queue.push({
      id: state.nextId++,
      face: pick(FACES),
      name: pick(NAMES),
      drink: drink,
      patience: pat,
      maxPatience: pat,
      leaving: false,
      leaveTimer: 0
    });
    state.spawned++;
    state.queueVersion++;
  }

  function frontCustomer() { return state.queue.find((c) => !c.leaving) || null; }

  /* ── build machine ────────────────────────────────────── */

  function beginBuild() {
    const c = frontCustomer();
    if (!c) { state.step = 'idle'; state.build = null; state.mini = null; renderPanels(); renderTicket(); renderCup(); return; }
    state.build = {
      customer: c.id,
      drink: c.drink,
      grind: null,
      shots: [],
      steam: null,
      extras: new Set(),
      startedAt: c.patience
    };
    gotoStep('grind');
    renderTicket();
    renderCup();
    renderExtras();
  }

  function gotoStep(step) {
    state.step = step;
    const b = state.build;
    if (step === 'grind') {
      const p = grindParams();
      state.mini = { kind: 'grind', p: p, v: 0, holding: false, done: false };
    } else if (step === 'extract') {
      const p = extractParams();
      state.mini = { kind: 'extract', p: p, v: 0, dir: 1 };
    } else if (step === 'steam') {
      const p = steamParams(b.drink);
      state.mini = { kind: 'steam', p: p, t: -0.9, wand: 0.5, target: 0.5, on: 0 };
    } else if (step === 'finish') {
      state.mini = null;
    }
    renderPanels();
    renderTicket();
  }

  function afterExtraction() {
    const b = state.build;
    if (b.shots.length < b.drink.shots) { gotoStep('extract'); return; }
    if (b.drink.milk) gotoStep('steam'); else gotoStep('finish');
  }

  function binIt() {
    if (state.phase !== 'playing' || !state.build) return;
    Sound.unlock(); Sound.bad();
    toast('Binned — starting over', 'bad');
    beginBuild();
  }

  /* ── serving ──────────────────────────────────────────── */

  function serve() {
    if (state.phase !== 'playing' || state.step !== 'finish' || !state.build) return;
    const b = state.build;
    const c = state.queue.find((x) => x.id === b.customer);
    if (!c) { beginBuild(); return; }

    const want = new Set(b.drink.extras);
    let mistakes = 0;
    want.forEach((id) => { if (!b.extras.has(id)) mistakes++; });
    b.extras.forEach((id) => { if (!want.has(id)) mistakes++; });
    const extraFactor = Math.max(0.1, 1 - 0.32 * mistakes);

    const g = b.grind == null ? 0 : b.grind;
    const e = b.shots.length ? b.shots.reduce((a, v) => a + v, 0) / b.shots.length : 0;
    const s = b.drink.milk ? (b.steam == null ? 0 : b.steam) : 1;
    const craft = 0.34 * g + 0.40 * e + 0.26 * s;
    const q = clamp(craft * extraFactor, 0, 1);

    const patLeft = clamp(c.patience / c.maxPatience, 0, 1);
    const combo = 1 + 0.1 * Math.min(state.streak, 10);
    const pay = b.drink.price * (0.25 + 0.95 * q);
    const tip = b.drink.price * 0.40 * q * patLeft * (1 + 0.20 * state.upg.sign) * combo;
    const take = pay + tip;

    state.earned += take;
    state.totalEarned += take;
    state.served++;

    const stars = Math.max(1, Math.min(5, Math.round(q * 5)));
    let label, cls;
    if (mistakes > 0)      { label = mistakes === 1 ? 'Wrong order!' : 'Nothing like the ticket!'; cls = 'bad'; }
    else if (q >= 0.9)     { label = 'Perfect pour!';  cls = 'gold'; }
    else if (q >= 0.75)    { label = 'Lovely cup';     cls = 'good'; }
    else if (q >= 0.55)    { label = 'Drinkable';      cls = 'good'; }
    else                   { label = 'Rough one…';     cls = 'bad'; }

    const kept = q >= 0.85 && mistakes === 0;
    state.streak = kept ? state.streak + 1 : 0;
    state.rep = clamp(state.rep + (q >= 0.8 ? 4 : q >= 0.6 ? 2 : q >= 0.4 ? -1 : -5), 0, 100);

    Sound.unlock();
    if (q >= 0.9 && mistakes === 0) Sound.great(); else if (q >= 0.55) Sound.good(); else Sound.bad();

    toast('★'.repeat(stars) + '☆'.repeat(5 - stars) + '  ' + label + '  ' + money(take) +
      (state.streak >= 2 ? '  🔥×' + state.streak : ''), cls);

    c.leaving = true;
    c.leaveTimer = 0.26;
    state.queueVersion++;

    state.build = null;
    state.mini = null;
    state.step = 'idle';
    renderPanels();
    renderTicket();
    renderCup();
    renderStats();
  }

  function walkOut(c) {
    c.leaving = true;
    c.leaveTimer = 0.26;
    state.walkouts++;
    state.rep = clamp(state.rep - 12, 0, 100);
    state.streak = 0;
    state.queueVersion++;
    Sound.unlock(); Sound.walkout();
    toast(c.name + ' walked out \u{1F620}  \u221212 rep', 'bad');
    if (state.build && state.build.customer === c.id) {
      state.build = null;
      state.mini = null;
      state.step = 'idle';
      renderPanels(); renderTicket(); renderCup();
    }
  }

  /* ── update ───────────────────────────────────────────── */

  function update(dt) {
    if (state.phase !== 'playing') return;

    // spawning
    if (state.spawned < state.dayCustomers) {
      state.spawnTimer -= dt;
      const room = state.queue.filter((c) => !c.leaving).length < 4;
      if (state.spawnTimer <= 0 && room) {
        spawnCustomer();
        state.spawnTimer = Math.max(2.2, 7.5 - state.day * 0.35) * rndRange(0.75, 1.25);
      }
    }

    // patience, and retiring anyone on their way out
    for (let i = state.queue.length - 1; i >= 0; i--) {
      const c = state.queue[i];
      if (c.leaving) {
        c.leaveTimer -= dt;
        if (c.leaveTimer <= 0) { state.queue.splice(i, 1); state.queueVersion++; }
        continue;
      }
      c.patience -= dt;
      if (c.patience <= 0) { c.patience = 0; walkOut(c); }
    }

    // pick up the next order
    if (!state.build && state.step === 'idle' && frontCustomer()) beginBuild();

    // minigames
    const m = state.mini;
    if (m) {
      if (m.kind === 'grind' && m.holding && !m.done) {
        m.v += m.p.speed * (1 + 0.9 * m.v) * dt;
        if (m.v >= 1) { m.v = 1; finishGrind(true); }
      } else if (m.kind === 'extract') {
        m.v += m.p.speed * m.dir * dt;
        if (m.v > 1) { m.v = 2 - m.v; m.dir = -1; }
        if (m.v < 0) { m.v = -m.v; m.dir = 1; }
      } else if (m.kind === 'steam') {
        m.t += dt;
        if (state.keys.left)  m.target = m.wand - 0.35;
        if (state.keys.right) m.target = m.wand + 0.35;
        m.target = clamp(m.target, 0, 1);
        const delta = m.target - m.wand;
        const max = m.p.wandSpeed * dt;
        m.wand += clamp(delta, -max, max);
        m.wand = clamp(m.wand, 0, 1);
        const c = steamCentre(m);
        if (m.t >= 0 && Math.abs(m.wand - c) <= m.p.half) m.on += dt;
        if (m.t >= m.p.dur) finishSteam();
      }
    }

    // day over?
    if (state.spawned >= state.dayCustomers && state.queue.length === 0) endDay();
    if (state.rep <= 0) gameOver('Word got around. The reviews finished you off.');
  }

  function steamCentre(m) {
    const p = m.p;
    const t = Math.max(0, m.t);
    return clamp(p.base + 0.22 * Math.sin(t * p.w1 + p.phase) + 0.10 * Math.sin(t * p.w2 + p.phase * 1.7), 0.08, 0.92);
  }

  /* ── minigame resolution ──────────────────────────────── */

  function startGrind() {
    const m = state.mini;
    if (!m || m.kind !== 'grind' || m.done) return;
    m.holding = true;
    Sound.unlock();
    dom.btnGrind.classList.add('held');
  }
  function finishGrind(overshot) {
    const m = state.mini;
    if (!m || m.kind !== 'grind' || m.done || !m.holding) return;
    m.done = true;
    m.holding = false;
    dom.btnGrind.classList.remove('held');
    const score = overshot ? 0 : bandScore(m.v, m.p.centre, m.p.half);
    state.build.grind = score;
    Sound.unlock();
    if (overshot) { Sound.bad(); toast('Grounds everywhere!', 'bad'); }
    else if (score >= 0.9) { Sound.coin(); toast('Dead on the dose', 'good'); }
    else Sound.click();
    renderCup();
    gotoStep('extract');
  }
  function lockShot() {
    const m = state.mini;
    if (!m || m.kind !== 'extract') return;
    const score = bandScore(m.v, m.p.centre, m.p.half);
    state.build.shots.push(score);
    Sound.unlock();
    if (score >= 0.9) { Sound.coin(); toast('Beautiful crema', 'good'); }
    else if (score <= 0.25) { Sound.bad(); toast(m.v < m.p.centre ? 'Sour — pulled short' : 'Bitter — over-extracted', 'bad'); }
    else Sound.click();
    renderCup();
    afterExtraction();
  }
  function finishSteam() {
    const m = state.mini;
    if (!m || m.kind !== 'steam') return;
    const raw = m.on / m.p.dur;
    const score = clamp((raw - 0.15) / 0.7, 0, 1);
    state.build.steam = score;
    Sound.unlock();
    if (score >= 0.9) { Sound.coin(); toast('Silky microfoam', 'good'); }
    else if (score <= 0.25) { Sound.bad(); toast('Scorched and bubbly', 'bad'); }
    else Sound.click();
    renderCup();
    gotoStep('finish');
  }

  /* ── end of day / game over ───────────────────────────── */

  function endDay() {
    state.phase = 'dayend';
    const surplus = state.earned - state.rent;
    if (surplus < 0) {
      state.cash += surplus;
      gameOver('You took ' + money(state.earned) + ' but rent was ' + money(state.rent) + '.');
      return;
    }
    state.cash += surplus;
    renderBooks(dom.books, surplus);
    dom.dayKicker.textContent = 'closing time';
    dom.dayTitle.textContent = 'Day ' + state.day + ' — rent paid';
    dom.btnNextDay.textContent = 'Start day ' + (state.day + 1);
    renderShop();
    dom.sheetMenu.hidden = true;
    dom.sheetOver.hidden = true;
    dom.sheetDay.hidden = false;
    dom.overlay.hidden = false;
    dom.btnNextDay.focus();
    Sound.unlock(); Sound.great();
  }

  function renderBooks(node, surplus) {
    const rows = [
      ['Cups served', String(state.served)],
      ['Walkouts', String(state.walkouts)],
      ['Takings', money(state.earned), 'pos'],
      ['Rent', '−' + money(state.rent), 'neg'],
      ['sep'],
      ['Surplus', (surplus >= 0 ? '+' : '−') + money(Math.abs(surplus)), surplus >= 0 ? 'pos' : 'neg'],
      ['In the till', money(Math.max(0, state.cash))]
    ];
    node.innerHTML = rows.map((r) => {
      if (r[0] === 'sep') return '<span class="sep"></span>';
      return '<span class="lbl">' + r[0] + '</span><span class="num ' + (r[2] || '') + '">' + r[1] + '</span>';
    }).join('');
  }

  function gameOver(reason) {
    state.phase = 'over';
    if (state.day - 1 > Store.get('bestDay')) Store.set('bestDay', state.day - 1);
    if (state.totalEarned > Store.get('bestCash')) Store.set('bestCash', state.totalEarned);
    dom.overTitle.textContent = 'You lasted ' + (state.day - 1) + ' full day' + (state.day - 1 === 1 ? '' : 's');
    dom.overReason.textContent = reason;
    dom.overBooks.innerHTML =
      '<span class="lbl">Days survived</span><span class="num">' + (state.day - 1) + '</span>' +
      '<span class="lbl">Lifetime takings</span><span class="num">' + money(state.totalEarned) + '</span>' +
      '<span class="lbl">Reputation</span><span class="num">' + Math.round(state.rep) + '%</span>' +
      '<span class="sep"></span>' +
      '<span class="lbl">Best run</span><span class="num pos">' + Store.get('bestDay') + ' days · ' + money(Store.get('bestCash')) + '</span>';
    dom.sheetMenu.hidden = true;
    dom.sheetDay.hidden = true;
    dom.sheetOver.hidden = false;
    dom.overlay.hidden = false;
    dom.btnRetry.focus();
    Sound.unlock(); Sound.walkout();
  }

  function nextDay() {
    state.day++;
    startDay();
  }

  function newGame() {
    state.day = 1; state.cash = 0; state.rep = 70; state.totalEarned = 0; state.streak = 0;
    state.upg = { grinder: 0, basket: 0, wand: 0, seats: 0, sign: 0 };
    startDay();
  }

  /* ── shop ─────────────────────────────────────────────── */

  function renderShop() {
    dom.shop.innerHTML = '';
    UPGRADES.forEach((u) => {
      const lv = state.upg[u.id];
      const maxed = lv >= UPG_MAX;
      const cost = maxed ? 0 : UPG_COST[lv];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'upg';
      b.disabled = maxed || state.cash < cost;
      let pips = '';
      for (let i = 0; i < UPG_MAX; i++) pips += '<i class="' + (i < lv ? 'on' : '') + '"></i>';
      b.innerHTML =
        '<span class="upg-ic">' + u.ic + '</span>' +
        '<span><span class="upg-name">' + u.name + '</span><br>' +
        '<span class="upg-desc">' + u.desc + '</span>' +
        '<span class="upg-lv">' + pips + '</span></span>' +
        '<span class="upg-cost' + (maxed ? ' max' : '') + '">' + (maxed ? 'MAX' : '$' + cost) + '</span>';
      b.addEventListener('click', () => {
        if (maxed || state.cash < cost) return;
        state.cash -= cost;
        state.upg[u.id]++;
        Sound.unlock(); Sound.coin();
        renderBooks(dom.books, state.earned - state.rent);
        renderShop();
      });
      dom.shop.appendChild(b);
    });
  }

  /* ── render ───────────────────────────────────────────── */

  let renderedQueueVersion = -1;

  function renderStats() {
    dom.statDay.textContent = String(state.day);
    dom.statEarned.textContent = money(state.earned);
    dom.statRent.textContent = money(state.rent);
    dom.statCash.textContent = money(Math.max(0, state.cash));
    dom.streakWrap.hidden = state.streak < 2;
    dom.statStreak.textContent = '🔥 ×' + (1 + 0.1 * Math.min(state.streak, 10)).toFixed(1);
    dom.repFill.style.width = state.rep + '%';
    dom.repbar.classList.toggle('low', state.rep < 30);
  }

  function renderQueue() {
    const left = Math.max(0, state.dayCustomers - state.served - state.walkouts);
    dom.queueNote.textContent = left + ' left today';
    if (renderedQueueVersion !== state.queueVersion) {
      renderedQueueVersion = state.queueVersion;
      dom.queue.innerHTML = '';
      const front = frontCustomer();
      state.queue.forEach((c) => {
        const el = document.createElement('div');
        el.className = 'cust' + (front && c.id === front.id ? ' front' : '') + (c.leaving ? ' leaving' : '');
        el.dataset.cid = String(c.id);
        const ex = c.drink.extras.map((id) => EXTRA_LABEL[id]).join(' · ');
        el.innerHTML =
          '<span class="cust-face" data-face>🙂</span>' +
          '<span><span class="cust-name">' + c.name + '</span><br>' +
          '<span class="cust-drink">' + c.drink.name + '</span>' +
          (ex ? '<br><span class="cust-extras">+ ' + ex + '</span>' : '') + '</span>' +
          '<span class="cust-pat"><i></i></span>';
        dom.queue.appendChild(el);
      });
      dom.queueEmpty.hidden = state.queue.length > 0;
    }
    // per-frame bits
    dom.queue.querySelectorAll('.cust').forEach((el) => {
      const c = state.queue.find((x) => String(x.id) === el.dataset.cid);
      if (!c) return;
      const f = clamp(c.patience / c.maxPatience, 0, 1);
      const bar = el.querySelector('.cust-pat');
      bar.firstElementChild.style.width = (f * 100) + '%';
      bar.classList.toggle('warn', f < 0.5 && f >= 0.22);
      bar.classList.toggle('crit', f < 0.22);
      const face = el.querySelector('[data-face]');
      face.textContent = c.leaving ? c.face : (f > 0.55 ? c.face : f > 0.25 ? '😐' : '😠');
    });
  }

  function renderRail() {
    const b = state.build;
    const order = ['grind', 'extract', 'steam', 'finish'];
    const at = order.indexOf(state.step);
    dom.steprail.querySelectorAll('li').forEach((li) => {
      const s = li.dataset.s;
      const i = order.indexOf(s);
      const skipped = s === 'steam' && b && !b.drink.milk;
      li.className = skipped ? 'skip' : at < 0 ? '' : i === at ? 'on' : i < at ? 'done' : '';
    });
  }

  function renderPanels() {
    renderRail();
    const p = dom.panels;
    for (const k in p) p[k].hidden = true;
    const key = state.step === 'idle' ? 'idle' : state.step;
    if (p[key]) p[key].hidden = false;
    if (state.step === 'grind') {
      const m = state.mini;
      dom.grindBand.style.left = ((m.p.centre - m.p.half) * 100) + '%';
      dom.grindBand.style.width = (m.p.half * 200) + '%';
    } else if (state.step === 'extract') {
      const m = state.mini, b = state.build;
      dom.extractBand.style.left = ((m.p.centre - m.p.half) * 100) + '%';
      dom.extractBand.style.width = (m.p.half * 200) + '%';
      dom.shotCount.textContent = b.drink.shots > 1 ? '(' + (b.shots.length + 1) + ' of ' + b.drink.shots + ')' : '';
      let dots = '';
      for (let i = 0; i < b.drink.shots; i++) dots += '<span class="' + (i < b.shots.length ? 'done' : '') + '"></span>';
      dom.shotDots.innerHTML = dots;
    } else if (state.step === 'steam') {
      dom.steamBand.style.width = (state.mini.p.half * 200) + '%';
      dom.steamHint.textContent = 'Milk for a ' + FOAM_WORD[state.build.drink.milk] + ' — hold the wand in the sweet spot.';
    } else if (state.step === 'finish') {
      renderExtras();
    }
  }

  function renderMini() {
    const m = state.mini;
    if (!m) return;
    if (m.kind === 'grind') {
      dom.grindFill.style.width = (m.v * 100) + '%';
      dom.grindNeedle.style.left = (m.v * 100) + '%';
      dom.grindDose.textContent = (m.v * 25).toFixed(1);
    } else if (m.kind === 'extract') {
      dom.extractMarker.style.left = (m.v * 100) + '%';
    } else if (m.kind === 'steam') {
      const c = steamCentre(m);
      dom.steamBand.style.left = ((c - m.p.half) * 100) + '%';
      dom.steamWand.style.left = (m.wand * 100) + '%';
      const prog = m.t < 0 ? 1 : clamp(1 - m.t / m.p.dur, 0, 1);
      dom.steamTimer.style.width = (prog * 100) + '%';
      dom.steamTimer.style.background = m.t < 0 ? '#93796288' : 'var(--crema)';
    }
  }

  function renderTicket() {
    const b = state.build;
    if (!b) { dom.ticket.hidden = true; return; }
    const c = state.queue.find((x) => x.id === b.customer);
    dom.ticket.hidden = false;
    dom.ticketFor.textContent = 'for ' + (c ? c.name : '—');
    dom.ticketPrice.textContent = money(b.drink.price);
    dom.ticketDrink.textContent = b.drink.name;
    const steps = [];
    steps.push({ t: 'Grind & dose', done: b.grind != null, now: state.step === 'grind' });
    steps.push({
      t: 'Espresso ×' + b.drink.shots + (b.drink.shots > 1 ? '  (' + b.shots.length + '/' + b.drink.shots + ')' : ''),
      done: b.shots.length >= b.drink.shots, now: state.step === 'extract'
    });
    if (b.drink.milk) steps.push({ t: 'Steam milk — ' + FOAM_WORD[b.drink.milk], done: b.steam != null, now: state.step === 'steam' });
    if (b.drink.extras.length) {
      b.drink.extras.forEach((id) => steps.push({ t: '+ ' + EXTRA_LABEL[id], done: b.extras.has(id), now: state.step === 'finish' }));
    } else {
      steps.push({ t: 'no extras', done: b.extras.size === 0 && state.step === 'finish', now: state.step === 'finish' });
    }
    dom.ticketSteps.innerHTML = steps.map((s) =>
      '<li class="' + (s.done ? 'done' : '') + (s.now && !s.done ? ' now' : '') + '">' +
      '<span class="tick">' + (s.done ? '✓' : '□') + '</span><span>' + s.t + '</span></li>'
    ).join('');
  }

  function renderCup() {
    const b = state.build;
    if (!b) {
      dom.lyrEspresso.style.height = '0%';
      dom.lyrMilk.style.height = '0%';
      dom.lyrFoam.style.height = '0%';
      dom.cupIce.hidden = true;
      dom.cupLiquid.style.filter = '';
      dom.cupCaption.textContent = 'clean cup, ready';
      return;
    }
    const esp = b.shots.length * (b.drink.shots > 1 ? 15 : 22);
    const hasColdMilk = b.extras.has('milk');
    const water = b.extras.has('water');
    let milk = 0, foam = 0;
    if (b.steam != null) {
      milk = b.drink.milk === 'thick' ? 40 : b.drink.milk === 'micro' ? 52 : 48;
      foam = b.drink.milk === 'thick' ? 26 : b.drink.milk === 'micro' ? 10 : 16;
    } else if (hasColdMilk) milk = 48;
    else if (water) milk = 44;
    dom.lyrEspresso.style.height = esp + '%';
    dom.lyrMilk.style.height = milk + '%';
    dom.lyrFoam.style.height = foam + '%';
    dom.lyrMilk.style.background = water && b.steam == null
      ? 'linear-gradient(180deg,#a9714133,#8a5a2f55)'
      : 'linear-gradient(180deg,#f2e3cd,#e2cdae)';
    dom.cupIce.hidden = !b.extras.has('ice');
    const tint = b.extras.has('choc') ? 'sepia(.35) saturate(1.3) brightness(.92)'
      : b.extras.has('caramel') ? 'sepia(.25) saturate(1.2)'
      : b.extras.has('cinn') ? 'sepia(.18)' : '';
    dom.cupLiquid.style.filter = tint;
    const bits = [];
    if (b.grind != null) bits.push('dosed');
    if (b.shots.length) bits.push(b.shots.length + ' shot' + (b.shots.length > 1 ? 's' : ''));
    if (b.steam != null) bits.push('steamed');
    if (b.extras.size) bits.push(b.extras.size + ' extra' + (b.extras.size > 1 ? 's' : ''));
    dom.cupCaption.textContent = bits.length ? bits.join(' · ') : 'building ' + b.drink.name.toLowerCase() + '…';
  }

  function renderAll() {
    renderStats(); renderQueue(); renderPanels(); renderMini(); renderTicket(); renderCup();
  }
  function render() {
    renderStats(); renderQueue(); renderMini();
  }

  function toast(text, cls) {
    const t = document.createElement('div');
    t.className = 'toast ' + (cls || '');
    t.textContent = text;
    dom.toasts.appendChild(t);
    const die = Date.now() + 2400;
    const tick = () => { if (Date.now() >= die) t.remove(); else setTimeout(tick, 200); };
    setTimeout(tick, 200);
    while (dom.toasts.children.length > 4) dom.toasts.removeChild(dom.toasts.firstChild);
  }

  /* ── input ────────────────────────────────────────────── */

  function primaryDown() {
    if (state.phase !== 'playing') return;
    if (state.step === 'grind') startGrind();
    else if (state.step === 'extract') lockShot();
    else if (state.step === 'finish') serve();
  }
  function primaryUp() {
    if (state.phase !== 'playing') return;
    if (state.step === 'grind') finishGrind(false);
  }

  function bindHold(btn) {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.unlock(); primaryDown(); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindHold(dom.btnGrind);
  bindHold(dom.btnExtract);
  window.addEventListener('pointerup', () => primaryUp());
  window.addEventListener('pointercancel', () => primaryUp());

  dom.btnServe.addEventListener('click', () => serve());
  dom.btnBin.addEventListener('click', () => binIt());

  // steam: drag or hover anywhere over the steam panel
  function steamPointer(e) {
    if (state.step !== 'steam' || !state.mini) return;
    const r = dom.steamTrack.getBoundingClientRect();
    if (r.width <= 0) return;
    state.mini.target = clamp((e.clientX - r.left) / r.width, 0, 1);
  }
  dom.panelSteam.addEventListener('pointermove', steamPointer);
  dom.panelSteam.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.unlock(); steamPointer(e); });

  window.addEventListener('keydown', (e) => {
    // let a focused control keep its native activation — never run both
    if (e.target && e.target.closest && e.target.closest('button, a, input')) return;
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { state.keys.left = true; e.preventDefault(); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { state.keys.right = true; e.preventDefault(); return; }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (e.repeat) return;
      Sound.unlock();
      if (!dom.overlay.hidden) {
        const btn = [dom.sheetMenu, dom.sheetDay, dom.sheetOver].find((s) => !s.hidden);
        if (btn) btn.querySelector('.cta').click();
        return;
      }
      primaryDown();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { state.keys.left = false; return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { state.keys.right = false; return; }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (e.target && e.target.closest && e.target.closest('button, a, input')) return;
      e.preventDefault();
      primaryUp();
    }
  });

  dom.btnSound.addEventListener('click', () => {
    Sound.on = !Sound.on;
    Store.set('sound', Sound.on);
    dom.btnSound.textContent = Sound.on ? '🔊' : '🔇';
    if (Sound.on) { Sound.unlock(); Sound.click(); }
  });
  dom.btnSound.textContent = Sound.on ? '🔊' : '🔇';

  dom.btnStart.addEventListener('click', () => { Sound.unlock(); newGame(); });
  dom.btnNextDay.addEventListener('click', () => { Sound.unlock(); nextDay(); });
  dom.btnRetry.addEventListener('click', () => { Sound.unlock(); newGame(); });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) resetClock(); });

  /* ── loop ─────────────────────────────────────────────── */

  const FIXED = 1 / 120;
  const MAX_FRAME = 0.25;
  let last = 0, acc = 0;

  function resetClock() { last = 0; acc = 0; }

  function advance(seconds) {
    acc += seconds;
    let guard = 0;
    while (acc >= FIXED && guard < 240) { update(FIXED); acc -= FIXED; guard++; }
    if (guard >= 240) acc = 0;
  }

  function frame(now) {
    if (!last) { last = now; acc = 0; }
    let dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    advance(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── boot ─────────────────────────────────────────────── */

  if (Store.get('bestDay') > 0) {
    dom.bestLine.hidden = false;
    dom.bestLine.textContent = 'Best run: ' + Store.get('bestDay') + ' days · ' + money(Store.get('bestCash'));
  }
  renderAll();
  dom.btnStart.focus();

  /* ── deterministic hook for automated checks (?test=1) ── */

  if (new URLSearchParams(location.search).has('test')) {
    window.__barista = {
      state: state,
      seed(n) { rngState = n >>> 0; },
      step(ms) { advance(ms / 1000); renderAll(); },
      down: primaryDown,
      up: primaryUp,
      setWand(x) { if (state.mini && state.mini.kind === 'steam') { state.mini.target = x; state.mini.wand = x; } },
      steamCentre() { return state.mini && state.mini.kind === 'steam' ? steamCentre(state.mini) : null; },
      params() { return state.mini ? state.mini.p : null; },
      value() { return state.mini ? state.mini.v : null; },
      toggle: toggleExtra,
      serve: serve,
      newGame: newGame,
      nextDay: nextDay,
      snapshot() {
        const b = state.build;
        return {
          phase: state.phase, day: state.day, step: state.step,
          earned: +state.earned.toFixed(2), rent: state.rent, cash: +state.cash.toFixed(2),
          rep: Math.round(state.rep), served: state.served, walkouts: state.walkouts, streak: state.streak,
          spawned: state.spawned, dayCustomers: state.dayCustomers,
          queue: state.queue.map((c) => ({ name: c.name, drink: c.drink.name, pat: +c.patience.toFixed(1), leaving: c.leaving })),
          build: b ? { drink: b.drink.name, grind: b.grind, shots: b.shots.slice(), steam: b.steam, extras: [].concat(Array.from(b.extras)) } : null
        };
      }
    };
  }

})();
