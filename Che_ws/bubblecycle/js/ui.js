// Shared UI pieces: icons, cards, chips, sheets, toasts and state placeholders.
import { html, useEffect, useRef, useState } from './lib.js';
import { MATERIALS } from './logic/rules.js';
import { SHAPES } from './data/bottledex.js';

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10.5 8v8M14 8v8M17 8v8"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8C10 4 6 4 6 6.5S9 8 12 8zM12 8c2-4 6-4 6-1.5S15 8 12 8z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  locate: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  directions: '<path d="M12 2l10 10-10 10L2 12z"/><path d="M9 14v-2.5a1 1 0 0 1 1-1h5M13 8.5l2 2-2 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15z"/><path d="M5 19c3-5 6-8 10-10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M17 14a5.5 5.5 0 0 1 4.5 5.5"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
};

export function iconSvg(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function Icon({ name, size = 22, label }) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden=${label ? undefined : 'true'}
    role=${label ? 'img' : undefined} aria-label=${label} dangerouslySetInnerHTML=${{ __html: ICONS[name] || '' }} />`;
}

export function BottleIcon({ entry, found = true, size = 56 }) {
  const shape = SHAPES[entry.shape] || SHAPES.tall;
  const style = found ? `fill:${entry.tint};stroke:#3b352d` : 'fill:none;stroke:#a89d86;stroke-dasharray:3 3';
  return html`<svg class="bottle-icon" width=${Math.round(size * 0.75)} height=${size} viewBox="0 0 48 64" style=${style} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: shape }} />`;
}

export function Avatar({ avatar, size = 44, label }) {
  const a = avatar || { initial: '?', tone: 'green' };
  return html`<span class=${`avatar-bubble av-${a.tone}`} style=${`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.44)}px`} role=${label ? 'img' : undefined} aria-label=${label} aria-hidden=${label ? undefined : 'true'}>${a.initial || '?'}</span>`;
}

export function Header({ title, subtitle, back, right }) {
  return html`<header class="screen-header">
    ${back && html`<button class="icon-btn" onClick=${() => (history.length > 1 ? history.back() : (location.hash = '#/home'))} aria-label="Go back"><${Icon} name="back" /></button>`}
    <div class="screen-title">
      <h1>${title}</h1>
      ${subtitle && html`<p class="muted">${subtitle}</p>`}
    </div>
    ${right}
  </header>`;
}

export function DemoTag({ children = 'Demo' }) {
  return html`<span class="tag tag-demo" title="Demo data — not real">${children}</span>`;
}

export function MaterialChip({ material, selected, onClick, small }) {
  const m = MATERIALS[material];
  if (!m) return null;
  const cls = `chip ${selected ? 'selected' : ''} ${small ? 'chip-sm' : ''}`;
  if (!onClick) return html`<span class=${cls}>${m.label}</span>`;
  return html`<button type="button" class=${cls} aria-pressed=${selected ? 'true' : 'false'} onClick=${onClick}>
    ${m.label}${selected && html` <${Icon} name="check" size=${16} />`}
  </button>`;
}

export function Chip({ selected, onClick, children }) {
  return html`<button type="button" class=${`chip ${selected ? 'selected' : ''}`} aria-pressed=${selected ? 'true' : 'false'} onClick=${onClick}>
    ${children}${selected && html` <${Icon} name="check" size=${16} />`}
  </button>`;
}

export function Segmented({ options, value, onChange, label }) {
  return html`<div class="segmented" role="tablist" aria-label=${label}>
    ${options.map((o) => html`<button type="button" role="tab" aria-selected=${value === o.value ? 'true' : 'false'}
      class=${value === o.value ? 'active' : ''} onClick=${() => onChange(o.value)}>${o.icon && html`<${Icon} name=${o.icon} size=${18} />`} ${o.label}</button>`)}
  </div>`;
}

export function Skeleton({ lines = 3 }) {
  return html`<div class="card skeleton-card" aria-busy="true" aria-label="Loading">
    ${Array.from({ length: lines }, (_, i) => html`<div class="skeleton" style=${`width:${90 - i * 18}%`}></div>`)}
  </div>`;
}

export function StateCard({ icon = 'info', tone = 'sky', title, children, action }) {
  return html`<div class=${`card state-card tone-${tone}`} role=${tone === 'peach' ? 'alert' : undefined}>
    <div class="state-icon"><${Icon} name=${icon} size=${24} /></div>
    <h3>${title}</h3>
    ${children && html`<div class="muted">${children}</div>`}
    ${action}
  </div>`;
}

// ---- Dialogs ---------------------------------------------------------------------------------
// Every modal in the app is a Sheet. It is a real dialog: it names itself, traps Tab, closes on Escape
// (topmost first, unless it's busy and `dismissable` is false), makes everything behind it inert, gives
// focus back to the control that opened it, and keeps itself above the on-screen keyboard.
const sheetStack = [];
export const openSheetCount = () => sheetStack.length;
const inertCount = new WeakMap();
let sheetSeq = 0;

// Makes every element outside the dialog's own branch of the page inert (no focus, no clicks, hidden from
// screen readers). Counted, so stacked dialogs release in the right order. Toasts stay live on purpose.
function lockBackground(dialogRoot) {
  const locked = [];
  for (let node = dialogRoot; node && node !== document.body; node = node.parentElement) {
    const parent = node.parentElement;
    if (!parent) break;
    for (const sib of parent.children) {
      if (sib === node || sib.hasAttribute('data-keep-active') || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(sib.tagName)) continue;
      inertCount.set(sib, (inertCount.get(sib) || 0) + 1);
      sib.inert = true;
      locked.push(sib);
    }
  }
  return () => locked.forEach((el) => {
    const n = (inertCount.get(el) || 1) - 1;
    inertCount.set(el, n);
    if (n <= 0) el.inert = false;
  });
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
function trapTab(e, root) {
  const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0]; const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
}

export function Sheet({ open, onClose, title, children, dismissable = true }) {
  const ref = useRef();
  const latest = useRef({});
  latest.current = { onClose, dismissable };
  const titleId = useRef(null);
  if (!titleId.current) titleId.current = `sheet-title-${++sheetSeq}`;

  useEffect(() => {
    if (!open) return undefined;
    const dialog = ref.current;
    const backdrop = dialog.parentElement;
    const id = ++sheetSeq;
    sheetStack.push(id);
    const opener = document.activeElement;
    const unlock = lockBackground(backdrop);
    document.body.classList.add('no-scroll');
    const t = setTimeout(() => dialog.querySelector('h2')?.focus(), 30);

    const onKey = (e) => {
      if (sheetStack[sheetStack.length - 1] !== id) return;
      if (e.key === 'Escape' && latest.current.dismissable) { e.preventDefault(); latest.current.onClose(); }
      else if (e.key === 'Tab') trapTab(e, dialog);
    };
    document.addEventListener('keydown', onKey);

    // Sit above the on-screen keyboard: follow the visual viewport, and bring a focused field into view.
    const vv = window.visualViewport;
    const fit = () => { if (!vv) return; backdrop.style.top = `${vv.offsetTop}px`; backdrop.style.height = `${vv.height}px`; };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    const reveal = (e) => {
      if (!e.target.matches?.('input, textarea, select')) return;
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => e.target.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' }), 250);
    };
    dialog.addEventListener('focusin', reveal);

    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      dialog.removeEventListener('focusin', reveal);
      sheetStack.splice(sheetStack.indexOf(id), 1);
      unlock();
      if (!sheetStack.length) document.body.classList.remove('no-scroll');
      if (opener && opener.isConnected && opener !== document.body) opener.focus?.();
      else document.getElementById('main')?.focus();
    };
  }, [open]);

  if (!open) return null;
  return html`<div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && dismissable && onClose()}>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby=${titleId.current} ref=${ref}>
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-head">
        <h2 id=${titleId.current} tabindex="-1">${title}</h2>
        <button type="button" class="icon-btn" onClick=${onClose} disabled=${!dismissable} aria-label=${`Close: ${title}`}><${Icon} name="x" /></button>
      </div>
      <div class="sheet-body">${children}</div>
    </div>
  </div>`;
}

// ---- Toasts ----------------------------------------------------------------
let toastListener = null;
export function toast(message, tone = 'mint') { toastListener?.({ id: Math.random(), message, tone }); }

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastListener = (t) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3800);
    };
    return () => { toastListener = null; };
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite" data-keep-active>
    ${items.map((t) => html`<div key=${t.id} class=${`toast tone-${t.tone}`}>${t.message}</div>`)}
  </div>`;
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return html`<label class=${`toggle-row ${disabled ? 'disabled' : ''}`}>
    <span class="toggle-text"><strong>${label}</strong>${description && html`<span class="muted small">${description}</span>`}</span>
    <input type="checkbox" role="switch" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} />
    <span class="toggle" aria-hidden="true"></span>
  </label>`;
}

export function ProgressRing({ value, max, size = 120, children }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, max ? value / max : 0);
  return html`<div class="ring" style=${`width:${size}px;height:${size}px`}>
    <svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx=${size / 2} cy=${size / 2} r=${r} class="ring-bg" />
      <circle cx=${size / 2} cy=${size / 2} r=${r} class="ring-fg" stroke-dasharray=${c} stroke-dashoffset=${c * (1 - pct)} />
    </svg>
    <div class="ring-label">${children}</div>
  </div>`;
}
