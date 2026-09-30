/** Minimal DOM helpers — no framework needed for a handful of menu screens. */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Parse a trusted, static SVG icon string. */
export function icon(svg: string, cls = 'icon'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svg;
  return span;
}

export function button(label: string, onClick: () => void, opts: { cls?: string; icon?: string; aria?: string; id?: string } = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn ${opts.cls ?? ''}`.trim(), 'aria-label': opts.aria ?? null, id: opts.id ?? null });
  if (opts.icon) b.append(icon(opts.icon));
  if (label) b.append(h('span', { class: 'btn-label' }, label));
  b.addEventListener('click', onClick);
  return b;
}

/** Accessible on/off switch. */
export function toggle(label: string, desc: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const id = `t-${Math.random().toString(36).slice(2, 8)}`;
  const sw = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(value), 'aria-labelledby': id, 'aria-describedby': `${id}-d` });
  const state = h('span', { class: 'switch-state' }, value ? 'On' : 'Off');
  sw.append(h('span', { class: 'switch-knob', 'aria-hidden': 'true' }), state);
  sw.addEventListener('click', () => {
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    state.textContent = next ? 'On' : 'Off';
    onChange(next);
  });
  return h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('div', { class: 'setting-label', id }, label), h('div', { class: 'setting-desc', id: `${id}-d` }, desc)), sw);
}
