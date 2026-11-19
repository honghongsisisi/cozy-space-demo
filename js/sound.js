// 효과음. 소리 파일을 쓰지 않고 브라우저에서 직접 만들어 냅니다(저작권 걱정 없음).
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

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 무시 */ }
  }

  footstep() {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800 + Math.random() * 600;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200 + Math.random() * 2200;
    bp.Q.value = 0.9;

    const g = c.createGain();
    const dur = 0.07 + Math.random() * 0.05;
    const vol = 0.5 + Math.random() * 0.3;
    // 빠르게 커졌다가 천천히 사라짐 + 중간에 한 번 더 '삭'
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vol * 0.25, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(hp).connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.8, dur + 0.02);
  }
}
