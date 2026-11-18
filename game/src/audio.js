// All sound is synthesized with WebAudio: engine hum, sirens, gunshots, pickups,
// mission jingles and a small music loop. No audio files, no network.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.15, when = 0, slideTo = null) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.2, freq = 1200, when = 0) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t0);
  }

  const MUSIC_BASS = [55, 0, 55, 65.4, 55, 0, 49, 58.3, 55, 0, 55, 65.4, 73.4, 65.4, 58.3, 49];
  const MUSIC_LEAD = [220, 0, 261.6, 0, 329.6, 0, 261.6, 220, 196, 0, 220, 261.6, 293.7, 261.6, 220, 196];

  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted) return;
      const bass = MUSIC_BASS[musicStep % MUSIC_BASS.length];
      const lead = MUSIC_LEAD[musicStep % MUSIC_LEAD.length];
      if (bass) tone(bass, 0.22, 'triangle', 0.07);
      if (lead && musicStep % 2 === 0) tone(lead, 0.18, 'square', 0.03);
      if (musicStep % 4 === 0) noise(0.03, 0.03, 6000);
      musicStep++;
    }, 240);
  }

  return {
    unlock() { ensure(); startMusic(); },
    toggleMute() {
      muted = !muted;
      if (muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (sirenGain) sirenGain.gain.value = 0;
      }
      return muted;
    },
    isMuted: () => muted,
    gunshot() { noise(0.12, 0.35, 900); tone(180, 0.08, 'square', 0.12, 0, 60); },
    punch() { noise(0.08, 0.2, 500); },
    pickup() { tone(660, 0.09, 'sine', 0.14); tone(990, 0.14, 'sine', 0.14, 0.08); },
    cash() { tone(880, 0.08, 'sine', 0.14); tone(1108, 0.08, 'sine', 0.14, 0.07); tone(1318, 0.18, 'sine', 0.14, 0.14); },
    fail() { tone(220, 0.25, 'sawtooth', 0.12, 0, 110); },
    missionStart() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, i * 0.09));
    },
    missionWin() {
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, i * 0.1));
    },
    phone() { tone(1200, 0.12, 'sine', 0.1); tone(1200, 0.12, 'sine', 0.1, 0.18); },
    crash() { noise(0.25, 0.3, 400); },
    busted() { tone(440, 0.4, 'sawtooth', 0.12, 0, 220); tone(330, 0.5, 'sawtooth', 0.12, 0.3, 165); },
    engine(speed01, on) {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 500;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      const target = on && !muted ? 0.02 + speed01 * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 140, ctx.currentTime, 0.1);
      engineFilter.frequency.setTargetAtTime(300 + speed01 * 1200, ctx.currentTime, 0.1);
    },
    siren(on, dt) {
      if (!ensure()) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain).connect(ctx.destination);
        sirenOsc.start();
      }
      sirenTimer += dt;
      const f = (Math.floor(sirenTimer * 1.6) % 2 === 0) ? 720 : 960;
      sirenOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.035, ctx.currentTime, 0.1);
    },
  };
}
