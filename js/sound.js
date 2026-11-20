// 효과음. 발소리·빗소리는 소리 파일 없이 브라우저에서 직접 만들어 냅니다(저작권 걱정 없음).
// 맑은 날 풍경 소리만 녹음 파일(sounds/wind-chime.mp3, 출처는 CREDITS.md)을 씁니다.
// 발소리 원리: '쉬익' 하는 잡음을 아주 짧게(0.1초 안팎) 틀고, 높은 음만 남기는 필터를 걸면
// 마른 잎을 밟는 '사각' 소리처럼 들립니다. 매번 높이·길이를 조금씩 바꿔 기계적으로 들리지 않게 합니다.
const KEY = 'cozy-space-demo:sound';

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    try { this.enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* 무시 */ }
    // 브라우저는 사용자가 한 번 클릭하기 전엔 소리를 막기 때문에, 첫 클릭 때 준비합니다.
    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22; // 전체 크기: 작게
    this.master.connect(this.ctx.destination);
    // 1초 분량의 잡음을 미리 만들어 두고 조각조각 꺼내 씀
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // 바스락거림: 잡음에 작은 '톡톡' 알갱이를 섞음
      d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.06 ? 1 : 0.35);
    }
  }

  // ---- 빗소리 ----
  // 느낌: 창밖 나뭇잎과 처마에 떨어지는 부드러운 비. '쉬~' 하는 잡음은 아주 작게, 빗방울 하나하나가 들리게.
  // 원리: 8초짜리 빗소리를 미리 한 번 '그려서' 만들어 두고 끝없이 이어 틉니다.
  //  ① 잔빗방울: 아주 짧고 작은 '톡' 소리 수백 개 (나뭇잎에 스치는 비)
  //  ② 잎사귀 방울: 부드러운 '투둑' 가끔 (음 높이가 없는 소리라 통통 튀지 않음)
  //  ③ 바탕: 아주 작고 가벼운 빗소리 (낮게 울리는 소리는 빼서 천둥 느낌 없음)
  // 빗방울 자리를 8초 안에서 돌려 붙여서, 이어 틀 때 이음새가 들리지 않습니다.
  setRain(on, indoor = false) {
    this.wantRain = on; this.wantIndoor = indoor;
    if (!this.ctx) return;
    if (!this.rainGain) this.buildRain();
    const target = on && this.enabled ? (indoor ? 0.6 : 1.6) : 0; // v0.29: 너무 작다고 해서 두 배로. 집 안에서는 창밖 빗소리처럼 작게
    if (this.rainTarget !== target) {
      this.rainTarget = target;
      this.rainGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.2); // 천천히 커지고 작아짐
    }
  }

  buildRain() {
    const c = this.ctx, sr = c.sampleRate, len = sr * 8;
    const buf = c.createBuffer(2, len, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const put = (i, v, pan) => { const k = ((i % len) + len) % len; L[k] += v * (1 - pan); R[k] += v * (1 + pan); };

    // ③ 바탕: 가볍게 거른 잡음을 아주 작게
    let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < len; i++) {
        a1 += 0.2 * ((rnd() * 2 - 1) - a1); a2 += 0.2 * (a1 - a2);
        b1 += 0.2 * ((rnd() * 2 - 1) - b1); b2 += 0.2 * (b1 - b2);
        if (pass === 1) { L[i] = a2 * 0.07; R[i] = b2 * 0.07; } // 낮게 울리는 소리 없이, 아주 작고 가벼운 바탕만
      }
    }
    // ① 잔빗방울: 1초에 약 120개, 2~6ms짜리 작은 '톡'
    for (let n = 0; n < 8 * 120; n++) {
      const at = Math.floor(rnd() * len), dur = Math.floor(sr * (0.002 + rnd() * 0.004));
      const amp = 0.02 + Math.pow(rnd(), 3) * 0.08, pan = rnd() * 1.6 - 0.8, cut = 0.15 + rnd() * 0.35;
      let y = 0;
      for (let j = 0; j < dur; j++) { y += cut * ((rnd() * 2 - 1) - y); put(at + j, y * amp * Math.exp(-j / (dur * 0.3)), pan); }
    }
    // ② 잎사귀 방울: 음 높이가 들리지 않게(통통 튀지 않게) 잡음을 걸러 만든 가볍고 짧은 '투둑'
    const softDrop = (count, cutLo, cutHi, ampLo, ampHi, decay) => {
      for (let n = 0; n < count; n++) {
        const at = Math.floor(rnd() * len), dur = Math.floor(sr * decay * 5);
        const cut = cutLo + rnd() * (cutHi - cutLo), amp = ampLo + rnd() * (ampHi - ampLo), pan = rnd() * 1.4 - 0.7;
        let y1 = 0, y2 = 0;
        for (let j = 0; j < dur; j++) {
          const t = j / sr;
          y1 += cut * ((rnd() * 2 - 1) - y1); y2 += cut * (y1 - y2);
          const env = Math.min(1, t / 0.004) * Math.exp(-t / decay);
          put(at + j, y2 * env * amp, pan);
        }
      }
    };
    softDrop(8 * 6, 0.14, 0.24, 0.12, 0.22, 0.009); // 잎에 떨어지는 방울: 1초에 약 6개, 가볍고 짧게
    // (처마의 낮은 '툭'은 천둥처럼 들릴 수 있어서 뺐음)
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.5; // 날카로운 높은 소리는 걸러서 포근하게
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320; // 낮게 울리는 소리(우르릉)는 모두 걸러 냄
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    this.rainGain.connect(this.master);
    src.connect(hp).connect(lp).connect(this.rainGain);
    src.start();
    this.rainTarget = 0;
  }

  // ---- 맑은 날 풍경 소리 ----
  // 41초짜리 녹음을 끝없이 이어 틀어요. 파일의 끝과 처음을 3초 동안 겹쳐 두어서 이음새가 들리지 않아요.
  // 파일은 맑음일 때 처음 한 번만 받아 와요.
  setChime(on, indoor = false) {
    this.wantChime = on; this.wantChimeIndoor = indoor;
    if (!this.ctx) return;
    if (!this.chimeGain) {
      this.chimeGain = this.ctx.createGain(); this.chimeGain.gain.value = 0; this.chimeTarget = 0;
      this.chimeGain.connect(this.master);
    }
    if (on && !this.chimeLoading) {
      this.chimeLoading = true;
      fetch('sounds/wind-chime.mp3?v=0.36').then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => {
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.loopStart = 0.06; src.loopEnd = buf.duration - 0.06; // mp3 앞뒤의 아주 짧은 빈칸은 건너뜀
        src.connect(this.chimeGain);
        src.start(0, 0.06);
      }).catch(() => { this.chimeLoading = false; });
    }
    const target = on && this.enabled ? (indoor ? 0.35 : 0.9) : 0; // 집 안에서는 창밖 풍경 소리처럼 작게
    if (this.chimeTarget !== target) {
      this.chimeTarget = target;
      this.chimeGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.5); // 천천히 커지고 작아짐
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx && this.wantRain !== undefined) this.setRain(this.wantRain, this.wantIndoor);
    if (this.ctx && this.wantChime !== undefined) this.setChime(this.wantChime, this.wantChimeIndoor);
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 무시 */ }
  }

  // 발소리: '통' 하고 가볍게 튀는 소리 + 낙엽을 살짝 밟는 작은 '바스락'.
  // 원리: ① '통' = 아주 짧은 낮은 음(약 0.05초)이 살짝 내려가며 사라짐 (말랑한 공이 튀는 느낌)
  //       ② '바스락' = 잡음을 아주 짧게, 높은 음만 남겨 작게
  //       왼발·오른발 음 높이를 조금씩 다르게 해서 '통, 통' 리듬이 귀엽게 들리게.
  footstep() {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    this.stepSide = !this.stepSide;

    // ① 통
    const o = c.createOscillator();
    o.type = 'sine';
    const f0 = (this.stepSide ? 300 : 260) * (0.95 + Math.random() * 0.1);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.06);
    const og = c.createGain();
    const ov = 0.42 + Math.random() * 0.08;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(ov, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    const olp = c.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 1200;
    o.connect(olp).connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.09);

    // ② 바스락 (작고 짧게)
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + Math.random() * 1400; bp.Q.value = 1.1;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
    const g = c.createGain();
    const dur = 0.05 + Math.random() * 0.03, vol = 0.16 + Math.random() * 0.08;
    g.gain.setValueAtTime(0.0001, t + 0.005);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.8, dur + 0.02);
  }
}
