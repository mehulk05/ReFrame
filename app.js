/* ReFrame — landing interactions
   - WebGL hero: floating "reframe" glass panels (Three.js)
   - scroll reveals, nav state, audio-bar motion, year
*/
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- year ---------- */
document.getElementById('yr').textContent = new Date().getFullYear();

/* ---------- nav scrolled state ---------- */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- scroll reveals ---------- */
const reveals = document.querySelectorAll('[data-reveal]');
const showAll = () => reveals.forEach((el) => el.classList.add('in'));
if (reduced || !('IntersectionObserver' in window)) {
  showAll();
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  reveals.forEach((el) => io.observe(el));
  // safety net: never leave content permanently hidden
  window.addEventListener('load', () => setTimeout(showAll, 2500), { once: true });
}

/* ---------- audio EQ bars ---------- */
const eq = document.getElementById('avBars');
if (eq) {
  const heights = [34, 58, 26, 70, 44, 62, 30, 52, 38, 66, 28, 48];
  heights.forEach((h, i) => {
    const b = document.createElement('span');
    b.style.height = h + 'px';
    b.style.animationDelay = (i * 0.09).toFixed(2) + 's';
    b.style.animationDuration = (0.9 + (i % 4) * 0.18).toFixed(2) + 's';
    eq.appendChild(b);
  });
}

/* ============================================================
   WebGL hero scene
   ============================================================ */
(function heroScene() {
  const canvas = document.getElementById('scene');
  if (!canvas || reduced) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (err) {
    console.warn('[ReFrame] WebGL unavailable — CSS hero only:', err);
    return; // no WebGL — CSS gradients carry the hero
  }

  const hero = canvas.parentElement;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x08090a, 14, 34);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 16);

  const ACCENT = 0x6872e5, BRIGHT = 0x8b94f0;
  // material refs so the scene can re-tint when the theme switches
  const bandMats = [], fillMats = [], gripMats = [];
  let particleMat = null;
  const themeOf = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

  /* rounded-rect path helper (works for Shape or Path) */
  function roundRect(curve, w, h, r) {
    const x = -w / 2, y = -h / 2;
    curve.moveTo(x + r, y);
    curve.lineTo(x + w - r, y);
    curve.quadraticCurveTo(x + w, y, x + w, y + r);
    curve.lineTo(x + w, y + h - r);
    curve.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    curve.lineTo(x + r, y + h);
    curve.quadraticCurveTo(x, y + h, x, y + h - r);
    curve.lineTo(x, y + r);
    curve.quadraticCurveTo(x, y, x + r, y);
    return curve;
  }

  /* one glowing frame: bright border band + faint glass fill */
  function makeFrame(w, h, color) {
    const g = new THREE.Group();
    const t = Math.min(w, h) * 0.045;          // border thickness
    const rOut = Math.min(w, h) * 0.08;
    const iw = w - t * 2, ih = h - t * 2;
    const rIn = Math.min(iw, ih) * 0.06;

    const outer = roundRect(new THREE.Shape(), w, h, rOut);
    outer.holes.push(roundRect(new THREE.Path(), iw, ih, rIn));
    const bandMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    bandMats.push(bandMat);
    const band = new THREE.Mesh(new THREE.ShapeGeometry(outer), bandMat);
    g.add(band);

    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
    fillMats.push(fillMat);
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(new THREE.Shape(), iw, ih, rIn)), fillMat);
    g.add(fill);

    // corner grip dot
    const gripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    gripMats.push(gripMat);
    const grip = new THREE.Mesh(new THREE.CircleGeometry(t * 1.4, 24), gripMat);
    grip.position.set(w / 2 - t, -h / 2 + t, 0.01);
    g.add(grip);

    return g;
  }

  // aspect-ratio panels scattered to the sides, leaving the centre for copy
  const specs = [
    { ratio: 9 / 16, hgt: 6.2, pos: [-6.2, 0.6, 0], rot: 0.12, color: BRIGHT },
    { ratio: 1,      hgt: 3.4, pos: [5.6, 3.0, -4], rot: -0.18, color: ACCENT },
    { ratio: 4 / 5,  hgt: 4.4, pos: [6.4, -2.4, -2], rot: 0.10, color: BRIGHT },
    { ratio: 16 / 9, hgt: 2.8, pos: [-5.4, -3.4, -5], rot: -0.12, color: ACCENT },
    { ratio: 3 / 4,  hgt: 3.0, pos: [-7.6, 3.4, -8], rot: 0.16, color: ACCENT },
    { ratio: 9 / 16, hgt: 2.6, pos: [8.4, 0.8, -9], rot: 0.22, color: BRIGHT },
  ];

  const world = new THREE.Group();
  const panels = [];
  specs.forEach((s, i) => {
    const f = makeFrame(s.hgt * s.ratio, s.hgt, s.color);
    f.position.set(...s.pos);
    f.rotation.z = s.rot;
    f.userData = { phase: i * 1.3, baseY: s.pos[1], baseRotZ: s.rot, spin: (i % 2 ? 1 : -1) * 0.04 };
    world.add(f);
    panels.push(f);
  });
  scene.add(world);

  /* drifting particle dust */
  const COUNT = 420;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 34;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 22 - 4;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  particleMat = new THREE.PointsMaterial({ color: BRIGHT, size: 0.045, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const particles = new THREE.Points(pGeo, particleMat);
  scene.add(particles);

  /* theme-aware re-tint: additive glow on dark, normal (opaque) ink on light */
  function applySceneTheme(theme) {
    const light = theme === 'light';
    scene.fog.color.set(light ? 0xeceef3 : 0x08090a);
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    bandMats.forEach((m) => { m.blending = blend; m.opacity = light ? 0.95 : 0.92; m.needsUpdate = true; });
    fillMats.forEach((m) => { m.blending = blend; m.opacity = light ? 0.10 : 0.05; m.needsUpdate = true; });
    gripMats.forEach((m) => { m.color.set(light ? 0x14151b : 0xffffff); m.needsUpdate = true; });
    if (particleMat) {
      particleMat.blending = blend;
      particleMat.color.set(light ? 0x5360cf : BRIGHT);
      particleMat.opacity = light ? 0.5 : 0.55;
      particleMat.needsUpdate = true;
    }
  }
  applySceneTheme(themeOf());
  window.addEventListener('themechange', (e) => applySceneTheme(e.detail || themeOf()));

  /* pointer parallax */
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  function resize() {
    const W = hero.clientWidth || window.innerWidth;
    const H = hero.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize, { once: true });
  // tab may have loaded in the background (rAF/layout paused) — re-measure when shown
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resize(); });

  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    cur.x += (target.x - cur.x) * 0.05;
    cur.y += (target.y - cur.y) * 0.05;

    world.rotation.y = Math.sin(t * 0.08) * 0.18 + cur.x * 0.28;
    world.rotation.x = -cur.y * 0.18;

    panels.forEach((p) => {
      p.position.y = p.userData.baseY + Math.sin(t * 0.6 + p.userData.phase) * 0.4;
      p.rotation.z = p.userData.baseRotZ + Math.sin(t * 0.4 + p.userData.phase) * 0.05;
      p.rotation.y = Math.sin(t * 0.3 + p.userData.phase) * 0.2;
    });

    particles.rotation.y = t * 0.02;
    particles.position.y = Math.sin(t * 0.2) * 0.6;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // fade in once first frame is painted (with a timer fallback if rAF is throttled)
  const reveal = () => canvas.classList.add('ready');
  requestAnimationFrame(() => requestAnimationFrame(reveal));
  setTimeout(reveal, 400);

  console.info('[ReFrame] hero scene built:', panels.length, 'panels');
})();
