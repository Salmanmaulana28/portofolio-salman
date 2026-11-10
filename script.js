/* ===== Sound engine ===== */
const Sound = (() => {
  let ctx = null, master, sfxBus, musicBus;
  let sfxOn = true, musicOn = false, timer = null, step = 0, nextTime = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.35; musicBus.connect(master);
  }

  function tone({ f = 440, to = null, t = 0.1, type = 'square', v = 0.2, delay = 0, bus = null }) {
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (to) o.frequency.exponentialRampToValueAtTime(to, now + t);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(v, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(now); o.stop(now + t + 0.02);
  }

  function noise({ t = 0.2, v = 0.2, from = 4000, to = 400, q = 1, delay = 0, type = 'bandpass', bus = null }) {
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * t));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(from, now);
    flt.frequency.exponentialRampToValueAtTime(to, now + t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    src.connect(flt); flt.connect(g); g.connect(bus || sfxBus);
    src.start(now); src.stop(now + t + 0.02);
  }

  const sounds = {
    hover()  { tone({ f: 1100, to: 1700, t: 0.05, type: 'square', v: 0.07 }); },
    move()   { tone({ f: 700, to: 1100, t: 0.06, type: 'square', v: 0.1 }); tone({ f: 1400, t: 0.04, type: 'triangle', v: 0.06, delay: 0.03 }); },
    select() {
      noise({ t: 0.09, v: 0.35, from: 6000, to: 1200, q: 0.8 });
      tone({ f: 520, t: 0.09, type: 'square', v: 0.12 });
      tone({ f: 780, t: 0.14, type: 'square', v: 0.12, delay: 0.07 });
      tone({ f: 1040, t: 0.2, type: 'triangle', v: 0.12, delay: 0.13 });
    },
    whoosh() {
      noise({ t: 0.7, v: 0.45, from: 300, to: 5000, q: 0.9 });
      noise({ t: 0.5, v: 0.3, from: 5000, to: 300, q: 0.9, delay: 0.35 });
      tone({ f: 90, to: 40, t: 0.5, type: 'sawtooth', v: 0.1 });
    },
    stamp() {
      tone({ f: 160, to: 40, t: 0.28, type: 'sine', v: 0.5 });
      noise({ t: 0.12, v: 0.4, from: 2500, to: 200, q: 0.7 });
    },
    on()  { tone({ f: 440, t: 0.08, type: 'square', v: 0.12 }); tone({ f: 880, t: 0.12, type: 'square', v: 0.12, delay: 0.07 }); },
    off() { tone({ f: 880, t: 0.08, type: 'square', v: 0.12 }); tone({ f: 330, t: 0.14, type: 'square', v: 0.12, delay: 0.07 }); },
    reveal() {
      tone({ f: 300, to: 900, t: 0.18, type: 'sawtooth', v: 0.07 });
      noise({ t: 0.15, v: 0.18, from: 1500, to: 6000, q: 1.2 });
    },
    send() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ f, t: 0.14, type: 'square', v: 0.12, delay: i * 0.07 }));
      noise({ t: 0.5, v: 0.25, from: 400, to: 7000, q: 0.9, delay: 0.25 });
    }
  };

  function play(name) {
    if (!sfxOn || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (sounds[name]) sounds[name]();
  }

  const BPM = 108;
  const stepDur = 60 / BPM / 4;
  const bassPat = [0, null, null, 0, null, 3, null, 5, 7, null, 5, null, 3, null, 0, null];
  const chordSteps = { 2: [0, 3, 7], 6: [3, 7, 10], 10: [0, 3, 7], 14: [5, 8, 12] };
  const hatSteps = new Set([0, 2, 4, 6, 8, 10, 12, 14]);
  const kickSteps = new Set([0, 6, 8, 12]);
  const snareSteps = new Set([4, 12]);
  const hz = (semi, base = 55) => base * Math.pow(2, semi / 12);

  function scheduleStep(s, time) {
    if (!ctx) return;
    const delay = Math.max(0, time - ctx.currentTime);
    const i = s % 16;
    if (kickSteps.has(i)) tone({ f: 140, to: 45, t: 0.16, type: 'sine', v: 0.55, delay, bus: musicBus });
    if (snareSteps.has(i)) noise({ t: 0.14, v: 0.28, from: 3500, to: 1500, q: 0.7, delay, bus: musicBus });
    if (hatSteps.has(i)) noise({ t: 0.035, v: 0.12, from: 9000, to: 7000, q: 0.5, delay, type: 'highpass', bus: musicBus });
    const b = bassPat[i];
    if (b !== null) tone({ f: hz(b), t: stepDur * 1.8, type: 'sawtooth', v: 0.16, delay, bus: musicBus });
    const ch = chordSteps[i];
    if (ch) ch.forEach((semi) => tone({ f: hz(semi, 220), t: stepDur * 1.4, type: 'square', v: 0.045, delay, bus: musicBus }));
  }

  function scheduler() {
    while (nextTime < ctx.currentTime + 0.2) {
      scheduleStep(step, nextTime);
      nextTime += stepDur;
      step = (step + 1) % 16;
    }
  }

  function startMusic() {
    init();
    if (!ctx || timer) return;
    nextTime = ctx.currentTime + 0.05; step = 0;
    timer = setInterval(scheduler, 50);
  }
  function stopMusic() { clearInterval(timer); timer = null; }

  return {
    init, play,
    setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? 1 : 0; },
    setMusic(on) { musicOn = on; on ? startMusic() : stopMusic(); },
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; }
  };
})();

/* ===== Ransom-note text generator ===== */
(function ransom() {
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  document.querySelectorAll('[data-ransom]').forEach((el) => {
    const text = el.textContent.trim();
    el.textContent = '';
    el.setAttribute('aria-label', text);
    let last = -1;
    for (const ch of text) {
      if (ch === ' ') { 
        const g = document.createElement('span'); 
        g.className = 'rn-gap'; 
        g.setAttribute('aria-hidden', 'true'); 
        el.appendChild(g); 
        continue; 
      }
      let k; do { k = Math.floor(rnd() * 6); } while (k === last);
      last = k;
      const s = document.createElement('span');
      s.className = 'rn r' + k;
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch;
      s.style.transform = 'rotate(' + ((rnd() * 10 - 5).toFixed(1)) + 'deg) translateY(' + ((rnd() * 8 - 4).toFixed(1)) + 'px)';
      s.style.fontSize = (0.9 + rnd() * 0.3).toFixed(2) + 'em';
      el.appendChild(s);
    }
  });
})();

/* ===== PIPS SKILL DINAMIS SESUAI RANK ===== */
document.getElementById('year').textContent = new Date().getFullYear();

function renderSkillPips() {
  document.querySelectorAll('.skill').forEach((s) => {
    const pipsContainer = s.querySelector('.pips');
    const rank = parseInt(s.dataset.rank, 10) || 0;
    
    // Update teks RANK X otomatis
    const rankText = s.querySelector('.rank');
    if (rankText) rankText.textContent = `RANK ${rank}`;
    
    pipsContainer.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement('i');
      if (i < rank) {
        pip.classList.add('fill');
      }
      pipsContainer.appendChild(pip);
    }
  });
}
renderSkillPips();

/* ===== Splash / Masuk ===== */
(function splash() {
  const splashEl = document.getElementById('splash');
  const btn = document.getElementById('enter');
  const enter = () => {
    if (!splashEl || splashEl.classList.contains('leave')) return;
    Sound.init();
    Sound.play('stamp');
    setTimeout(() => Sound.play('whoosh'), 120);
    splashEl.classList.add('leave');
    setTimeout(() => splashEl.remove(), 800);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { 
    if (e.key === 'Enter' || e.key === ' ') { 
      e.preventDefault(); 
      enter(); 
    } 
  };
  btn.addEventListener('click', enter);
  document.addEventListener('keydown', onKey);
  btn.focus();
})();

/* ===== Tombol SFX / Music ===== */
(function audioButtons() {
  const sfx = document.getElementById('btn-sfx');
  const music = document.getElementById('btn-music');
  const setState = (btn, on) => { btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('on', on); };
  sfx.addEventListener('click', () => {
    const on = !Sound.sfxOn;
    if (on) Sound.setSfx(true), Sound.play('on'); else Sound.play('off'), setTimeout(() => Sound.setSfx(false), 200);
    setState(sfx, on);
  });
  music.addEventListener('click', () => {
    Sound.init();
    const on = !Sound.musicOn;
    Sound.setMusic(on);
    Sound.play(on ? 'on' : 'off');
    setState(music, on);
  });
})();

/* ===== Transisi layar + navigasi ===== */
const Nav = (() => {
  const wipe = document.getElementById('wipe');
  let busy = false;
  function go(id) {
    const target = document.getElementById(id);
    if (!target || busy) return;
    busy = true;
    Sound.play('whoosh');
    wipe.classList.remove('go'); void wipe.offsetWidth; wipe.classList.add('go');
    setTimeout(() => { target.scrollIntoView({ behavior: 'auto' }); }, 330);
    setTimeout(() => { wipe.classList.remove('go'); busy = false; }, 900);
  }
  return { go };
})();

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  const id = a.getAttribute('href').slice(1);
  if (!id) return;
  a.addEventListener('click', (e) => { e.preventDefault(); Sound.play('select'); Nav.go(id); });
});

/* ===== Hover SFX ===== */
document.querySelectorAll('[data-sfx]').forEach((el) => {
  const kind = el.dataset.sfx;
  if (kind === 'hover') el.addEventListener('mouseenter', () => Sound.play('hover'));
  if (kind === 'select') el.addEventListener('click', () => Sound.play('select'));
});
document.querySelectorAll('.palace').forEach((el) => el.addEventListener('mouseenter', () => Sound.play('hover')));
document.querySelectorAll('.chip').forEach((el) => el.addEventListener('mouseenter', () => Sound.play('hover')));

/* ===== Navigasi Keyboard (Menu Utama & ESC Key) ===== */
(function commandMenu() {
  const items = Array.from(document.querySelectorAll('#menu li'));
  let current = 0;
  const setActive = (i, silent) => {
    const next = (i + items.length) % items.length;
    if (next !== current && !silent) Sound.play('move');
    current = next;
    items.forEach((li, n) => li.classList.toggle('active', n === current));
  };
  items.forEach((li, i) => li.addEventListener('mouseenter', () => setActive(i)));

  document.addEventListener('keydown', (e) => {
    if (document.getElementById('splash')) return;
    
    // Fitur TOMBOL ESC untuk kembali ke Tampilan Awal (Home)
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      Nav.go('home');
      return;
    }

    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (['INPUT', 'TEXTAREA'].includes(tag)) return;
    if (document.getElementById('home').getBoundingClientRect().bottom < 120) return;

    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(current + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(current - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      Sound.play('select');
      Nav.go(items[current].querySelector('a').dataset.target);
    }
  });
})();

/* ===== Reveal Scroll ===== */
(function reveal() {
  const els = document.querySelectorAll('.reveal');
  const show = (el) => { el.classList.add('visible'); };
  if (!('IntersectionObserver' in window)) { els.forEach(show); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { show(en.target); Sound.play('reveal'); io.unobserve(en.target); }
    });
  }, { threshold: 0.18 });
  els.forEach((el) => io.observe(el));
})();

/* ===== Form Kontak ===== */
(function contactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    Sound.play('send');
    const data = new FormData(form);
    const subject = encodeURIComponent('Pesan dari ' + data.get('nama'));
    const body = encodeURIComponent(data.get('pesan'));
    setTimeout(() => { window.location.href = 'mailto:salmanmln202@gmail.com?subject=' + subject + '&body=' + body; }, 450);
  });
})();