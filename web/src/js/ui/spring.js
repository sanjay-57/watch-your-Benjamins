// Spring physics → CSS linear() easing curves + a JS spring integrator for gestures.
import { reducedMotion } from '../core/util.js';

function simulate({ stiffness, damping, mass = 1 }) {
  const dt = 1 / 240;
  let x = 0, v = 0, t = 0, calm = 0;
  const pts = [0];
  while (t < 3) {
    const f = -stiffness * (x - 1) - damping * v;
    v += (f / mass) * dt;
    x += v * dt;
    t += dt;
    pts.push(x);
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.02) { if (++calm > 10) break; } else calm = 0;
  }
  return { pts, duration: t };
}

function toLinear(pts, samples = 44) {
  const out = [];
  const n = pts.length - 1;
  for (let i = 0; i <= samples; i++) out.push(+pts[Math.round((i / samples) * n)].toFixed(4));
  out[0] = 0;
  out[out.length - 1] = 1;
  return `linear(${out.join(',')})`;
}

const supportsLinear = (() => { try { return CSS.supports('transition-timing-function', 'linear(0, 1)'); } catch { return false; } })();

const DEFS = {
  spring: { stiffness: 330, damping: 24, fallback: 'cubic-bezier(.3,1.35,.55,1)' },   // lively, ~7% overshoot
  soft: { stiffness: 230, damping: 27, fallback: 'cubic-bezier(.3,1.12,.6,1)' },      // gentle settle
  sheet: { stiffness: 300, damping: 30, fallback: 'cubic-bezier(.25,1.08,.5,1)' },    // presentation
  snappy: { stiffness: 560, damping: 42, fallback: 'cubic-bezier(.2,1,.4,1)' },
};

export const SPR = {};
for (const [k, d] of Object.entries(DEFS)) {
  const { pts, duration } = simulate(d);
  SPR[k] = { easing: supportsLinear ? toLinear(pts) : d.fallback, duration: Math.round(Math.min(duration, 1.1) * 1000) };
}

export function installEasings() {
  if (!supportsLinear) return;
  const r = document.documentElement.style;
  r.setProperty('--ease-spring', SPR.spring.easing);
  r.setProperty('--ease-spring-soft', SPR.soft.easing);
}

/** WAAPI helper honouring reduced motion. */
export function animate(el, frames, opts = {}) {
  const o = { duration: 400, easing: SPR.spring.easing, fill: 'none', ...opts };
  if (reducedMotion()) o.duration = Math.min(o.duration, 1);
  try { return el.animate(frames, o); } catch { return { finished: Promise.resolve(), cancel() {} }; }
}

/**
 * Integrate a damped spring toward `to`, calling onUpdate(x, v) every frame.
 * Units are arbitrary (px, scale…); set restDelta/restSpeed accordingly.
 */
export function runSpring({ from, to, velocity = 0, stiffness = 380, damping = 30, mass = 1, restDelta = 0.1, restSpeed = 1, onUpdate, onComplete }) {
  let x = from, v = velocity, last = performance.now(), raf = 0, stopped = false;
  if (reducedMotion()) { onUpdate(to, 0); onComplete?.(); return { stop() {}, get value() { return to; }, get velocity() { return 0; } }; }
  const frame = now => {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const f = -stiffness * (x - to) - damping * v;
      v += (f / mass) * h;
      x += v * h;
    }
    const done = Math.abs(x - to) < restDelta && Math.abs(v) < restSpeed;
    onUpdate(done ? to : x, done ? 0 : v);
    if (done) { onComplete?.(); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); },
    get value() { return x; },
    get velocity() { return v; },
  };
}
