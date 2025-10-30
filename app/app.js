// app.js: handle splash reveal and audio playback
(function(){
  // clip-path support detection
  try{
    var div=document.createElement('div');
    div.style.clipPath='circle(50% at 50% 50%)';
    if(!div.style.clipPath) document.documentElement.classList.add('no-clip');
  }catch(e){document.documentElement.classList.add('no-clip')}

  const splash = document.getElementById('splash');
  const content = document.getElementById('content');
  const audioEl = document.getElementById('enterAudio');
  const muteBtn = document.getElementById('muteBtn');

  // audio fade settings
  const AUDIO_TARGET_VOLUME = 0.25; // final audible volume after fade
  try{ if(audioEl){ audioEl.volume = 0; } }catch(e){}

  function fadeAudioIn(duration){
    if(!audioEl) return;
    if(audioEl.muted) return; // don't unmute via fade
    duration = typeof duration === 'number' ? duration : 700; // ms
    const startVol = Math.max(0, Math.min(1, audioEl.volume || 0));
    const target = Math.max(0, Math.min(1, AUDIO_TARGET_VOLUME));
    const start = performance.now();
    function step(now){
      const t = Math.min(1, (now - start) / duration);
      try{ audioEl.volume = startVol + (target - startVol) * t; }catch(e){}
      if(t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // mute button UI helpers
  function speakerOnSVG(){ return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9H5z"/></svg>'; }
  function speakerMutedSVG(){ return '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.5 12c0-1.77-.77-3.36-1.98-4.44l1.42-1.42C17.71 7.77 18.5 9.79 18.5 12s-.79 4.23-2.56 5.86l-1.42-1.42C15.73 15.36 16.5 13.77 16.5 12zM4 9v6h4l5 5V4L8 9H4zm12.5 11.25L3.75 6 5.16 4.59 20.75 20.25 16.5 20.25z"/></svg>'; }

  function updateMuteUI(){
    if(!muteBtn || !audioEl) return;
    if(audioEl.muted){ muteBtn.setAttribute('aria-pressed','true'); muteBtn.innerHTML = speakerMutedSVG(); }
    else { muteBtn.setAttribute('aria-pressed','false'); muteBtn.innerHTML = speakerOnSVG(); }
  }
  // initialize mute state from localStorage if present
  try{
    const saved = localStorage.getItem('dissimilence-muted');
    if(saved !== null && audioEl){ audioEl.muted = saved === '1'; }
  }catch(e){}
  updateMuteUI();
  if(muteBtn){
    muteBtn.addEventListener('click', function(){
      if(!audioEl) return;
      audioEl.muted = !audioEl.muted;
      try{ localStorage.setItem('dissimilence-muted', audioEl.muted ? '1' : '0'); }catch(e){}
      updateMuteUI();
    });
  }

  // Parallax state for background radial gradients
  const parallax = {
    base: {bg1x:10, bg1y:10, bg2x:90, bg2y:90},
    target: {bg1x:10, bg1y:10, bg2x:90, bg2y:90},
    current: {bg1x:10, bg1y:10, bg2x:90, bg2y:90},
    raf: null,
    smoothing: 0.12,
    range: 12 // percent radius to move (stronger parallax)
  };

  function setBgVars(){
    try{
      const b = document.body;
      b.style.setProperty('--bg1x', parallax.current.bg1x + '%');
      b.style.setProperty('--bg1y', parallax.current.bg1y + '%');
      b.style.setProperty('--bg2x', parallax.current.bg2x + '%');
      b.style.setProperty('--bg2y', parallax.current.bg2y + '%');
    }catch(e){}
  }

  function lerp(a,b,t){return a + (b-a)*t}

  function parallaxLoop(){
    // smooth towards target
    let c = parallax.current;
    let t = parallax.target;
    const s = parallax.smoothing;
    c.bg1x = lerp(c.bg1x, t.bg1x, s);
    c.bg1y = lerp(c.bg1y, t.bg1y, s);
    c.bg2x = lerp(c.bg2x, t.bg2x, s);
    c.bg2y = lerp(c.bg2y, t.bg2y, s);
    setBgVars();
    // update tilt together with parallax smoothing
    try{ updateTilt(); }catch(e){}
    // continue loop if not yet near target
    const dx = Math.abs(c.bg1x - t.bg1x) + Math.abs(c.bg1y - t.bg1y) + Math.abs(c.bg2x - t.bg2x) + Math.abs(c.bg2y - t.bg2y);
    if(dx > 0.01){ parallax.raf = requestAnimationFrame(parallaxLoop); } else { parallax.raf = null; }
  }

  function onPointerMove(e){
    // compute ratio
    const rw = window.innerWidth || document.documentElement.clientWidth;
    const rh = window.innerHeight || document.documentElement.clientHeight;
    const rx = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0) / rw;
    const ry = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0) / rh;
    const halfX = (rx - 0.5);
    const halfY = (ry - 0.5);
    const range = parallax.range;
    parallax.target.bg1x = parallax.base.bg1x + (-halfX * range);
    parallax.target.bg1y = parallax.base.bg1y + (-halfY * range);
    parallax.target.bg2x = parallax.base.bg2x + (halfX * range);
    parallax.target.bg2y = parallax.base.bg2y + (halfY * range);
    if(!parallax.raf) parallax.raf = requestAnimationFrame(parallaxLoop);
  }

  // enable pointer-based parallax before reveal
  window.addEventListener('pointermove', onPointerMove, {passive:true});
  // initialize CSS vars
  setBgVars();

  // pointer normalized state for particles/tilt
  const pointerState = {x:0.5,y:0.5};

  // particle canvas + animation
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  let DPR = window.devicePixelRatio || 1;
  let particles = [];
  let particleRAF = null;
  let particleRunning = true;

  function resizeCanvas(){
    if(!canvas || !ctx) return;
    DPR = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }

  function createParticles(){
    if(!canvas || !ctx) return;
    particles.length = 0;
    const area = window.innerWidth * window.innerHeight;
    const density = 0.00007; // tuned for performance
    const count = Math.max(30, Math.min(160, Math.floor(area * density)));
    for(let i=0;i<count;i++){
      const r = 0.6 + Math.random()*2.6; // radius
      particles.push({
        x: Math.random()*canvas.width/DPR,
        y: Math.random()*canvas.height/DPR,
        r: r,
        vx: (Math.random()-0.5) * 0.2,
        vy: (Math.random()*0.4 + 0.1) * 0.2, // slow downward drift
        alpha: 0.06 + Math.random()*0.18,
        baseAlpha: 0.06 + Math.random()*0.18
      });
    }
  }

  function drawParticles(){
    if(!canvas || !ctx) return;
    const w = canvas.width / DPR;
    const h = canvas.height / DPR;
    ctx.clearRect(0,0,w,h);
    // subtle motion offset from pointer
  const ox = (pointerState.x - 0.5) * (w * 0.06);
  const oy = (pointerState.y - 0.5) * (h * 0.06);
    for(let i=0;i<particles.length;i++){
      const p = particles[i];
  p.x += p.vx + (ox * 0.003);
  p.y += p.vy + (oy * 0.003);
      // wrap
      if(p.x < -10) p.x = w + 10;
      if(p.x > w + 10) p.x = -10;
      if(p.y > h + 20) p.y = -20;
      if(p.y < -20) p.y = h + 20;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,' + (p.alpha) + ')';
      ctx.arc(p.x + ox * 0.03, p.y + oy * 0.03, p.r, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function particleLoop(){
    if(!particleRunning) return;
    drawParticles();
    particleRAF = requestAnimationFrame(particleLoop);
  }

  // tilt/foreground parallax (applies to #content)
  const tilt = { targetX:0, targetY:0, currentX:0, currentY:0, smoothing:0.12, range:10 };
  function updateTilt(){
    // smooth towards target
    tilt.currentX = lerp(tilt.currentX, tilt.targetX, tilt.smoothing);
    tilt.currentY = lerp(tilt.currentY, tilt.targetY, tilt.smoothing);
    // apply transform
    const rx = tilt.currentX;
    const ry = tilt.currentY;
    const el = content;
    if(el){
      const rotX = rx; // degrees
      const rotY = ry; // degrees
      el.style.transform = `translateZ(0) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    }
  }

  // update pointerState also
  function onPointerMoveEnhanced(e){
    // call existing handler
    onPointerMove(e);
    // normalized pointer
    const rw = window.innerWidth || document.documentElement.clientWidth;
    const rh = window.innerHeight || document.documentElement.clientHeight;
    const rx = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0) / rw;
    const ry = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0) / rh;
    pointerState.x = rx; pointerState.y = ry;
    // tilt target: map to degrees
    const halfX = (rx - 0.5);
    const halfY = (ry - 0.5);
    tilt.targetX = (halfY * -tilt.range); // invert so moving up tilts down
    tilt.targetY = (halfX * tilt.range);
    // start tilt loop if not running
    if(!parallax.raf) parallax.raf = requestAnimationFrame(parallaxLoop);
  }

  // replace pointer listener with enhanced one (keep a stable reference so we can remove later if needed)
  try{ window.removeEventListener('pointermove', onPointerMove); }catch(e){}
  const pointerHandler = onPointerMoveEnhanced;
  window.addEventListener('pointermove', pointerHandler, {passive:true});

  // start canvas and particles
  function startParticles(){
    if(!canvas || !ctx) return;
    resizeCanvas();
    createParticles();
    particleRunning = true;
    if(particleRAF) cancelAnimationFrame(particleRAF);
    particleRAF = requestAnimationFrame(particleLoop);
  }
  window.addEventListener('resize', function(){ resizeCanvas(); createParticles(); });
  // initialize
  startParticles();


  let revealed = false;

  function playFallbackTone(){
    // small beep using WebAudio (ensures something plays on gesture even if file missing)
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 440; // A4
      g.gain.value = 0.02; // low volume
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      setTimeout(()=>{ try{o.stop(); ctx.close();}catch(e){} }, 600);
    }catch(e){
      // last-resort: noop
    }
  }
    // reveal(byUser:boolean)
    // - byUser true: play audio and use fallback if audio fails
    // - byUser false (auto): only try audio.play() but do not force fallback tone
    function reveal(byUser){
      if(revealed) return;
      revealed = true;
      splash.dataset.state='animating';

  // lower splash z-index so socials and controls are visible immediately
  try{ splash.classList.add('revealing'); }catch(e){}

      if(byUser){
        // user gesture: attempt to play any loaded audio; fallback to WebAudio tone on failure
        if(audioEl){
          // ensure we start from 0 and then fade to target on success
          try{ audioEl.volume = 0; }catch(e){}
          const p = audioEl.play();
          if(p && typeof p.then === 'function'){
            p.then(()=>{ fadeAudioIn(700); }).catch(()=>{ playFallbackTone(); });
          }
        }else{
          playFallbackTone();
        }
      }else{
        // auto: attempt to play audio if it's allowed; ignore errors (no forced fallback)
        if(audioEl){
          const p = audioEl.play();
          if(p && typeof p.then === 'function'){
            p.catch(()=>{});
          }
        }
      }

  // start overlay shrink; content will be shown when the animation finishes
  splash.classList.add('reveal');
    // mark body as revealed so other UI (socials) can animate in
    try{ document.body.classList.add('revealed'); }catch(e){}

  // gently reset tilt target; let smoothing return it to zero
  try{ tilt.targetX = 0; tilt.targetY = 0; }catch(e){}
    }

  // user gesture: immediate reveal with sound
  splash.addEventListener('click', function(){
    // click interaction will usually focus the tab; treat as user-invoked reveal
    reveal(true);
  });
  splash.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); reveal(true); }
  });

  // Auto-enter has been removed: user must click to reveal the page.

  // when splash animation finishes, reveal content and remove splash from flow
  splash.addEventListener('animationend', function(){
    try{ content.classList.add('shown'); }catch(e){}
    try{ splash.style.display='none'; }catch(e){}
  });

})();
