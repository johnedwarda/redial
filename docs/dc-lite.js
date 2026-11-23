/*
 * dc-lite: a small, independent renderer for the prototype's .dc.html screens,
 * so they run as a plain static site (GitHub Pages) outside the design editor.
 *
 * It supports what these screens use: {{ path }} holes in text and attributes,
 * <sc-if value>, <sc-for list as>, <helmet>, JSX-style event attributes, refs,
 * and a `class Component extends DCLogic` logic class (a React class component
 * whose template takes its inputs from renderVals()).
 *
 * Usage: DCLite.mount(containerEl, "prototype/Main.dc.html", props)
 */
(function () {
  'use strict';
  const h = React.createElement;

  // HTML lowercases attribute names; map them back to the React prop names.
  const EVENTS = ['Click', 'DoubleClick', 'PointerDown', 'PointerMove', 'PointerUp', 'PointerCancel',
    'PointerEnter', 'PointerLeave', 'MouseDown', 'MouseUp', 'MouseMove', 'MouseEnter', 'MouseLeave',
    'TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'KeyDown', 'KeyUp', 'KeyPress', 'Change',
    'Input', 'Blur', 'Focus', 'Scroll', 'Wheel', 'ContextMenu', 'Submit', 'AnimationEnd', 'TransitionEnd'];
  const NAMES = {
    class: 'className', for: 'htmlFor', tabindex: 'tabIndex', autofocus: 'autoFocus', readonly: 'readOnly',
    maxlength: 'maxLength', minlength: 'minLength', spellcheck: 'spellCheck', autocomplete: 'autoComplete',
    inputmode: 'inputMode', enterkeyhint: 'enterKeyHint', contenteditable: 'contentEditable',
    colspan: 'colSpan', rowspan: 'rowSpan', srcset: 'srcSet', crossorigin: 'crossOrigin',
  };
  EVENTS.forEach((e) => { NAMES['on' + e.toLowerCase()] = 'on' + e; NAMES['on' + e] = 'on' + e; });
  EVENTS.forEach((e) => { NAMES['on' + e.toLowerCase() + 'capture'] = 'on' + e + 'Capture'; NAMES['on' + e + 'Capture'] = 'on' + e + 'Capture'; });
  const BOOL = { disabled: 1, checked: 1, autoFocus: 1, readOnly: 1, hidden: 1, required: 1, multiple: 1, selected: 1 };

  const HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;

  // A hole is a dotted lookup or a literal, never an expression.
  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (path === 'undefined' || path === '') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    let v = scope;
    for (const k of path.split('.')) {
      if (v == null) return undefined;
      v = v[k];
    }
    return v;
  }
  const str = (v) => (v == null || v === false ? '' : String(v));
  const interp = (s, scope) => s.replace(HOLE, (_, p) => str(lookup(p, scope)));

  function styleObj(css) {
    const out = {};
    let depth = 0, start = 0;
    const parts = [];
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' && depth === 0) { parts.push(css.slice(start, i)); start = i + 1; }
    }
    parts.push(css.slice(start));
    for (const p of parts) {
      const i = p.indexOf(':');
      if (i < 0) continue;
      const k = p.slice(0, i).trim();
      const v = p.slice(i + 1).trim();
      if (!k) continue;
      out[k.startsWith('--') ? k : k.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    return out;
  }

  // Compile a DOM node into a function (scope) -> React children.
  function compile(node) {
    if (node.nodeType === 3) {
      const text = node.nodeValue;
      if (!text.includes('{{')) return () => text;
      return (scope) => interp(text, scope);
    }
    if (node.nodeType !== 1) return null;
    const tag = node.localName;
    if (tag === 'helmet' || tag === 'script') return null;
    const kids = compileKids(node);

    if (tag === 'sc-if') {
      const m = WHOLE.exec(node.getAttribute('value') || '');
      const path = m ? m[1] : '';
      return (scope) => (lookup(path, scope) ? kids(scope) : null);
    }
    if (tag === 'sc-for') {
      const m = WHOLE.exec(node.getAttribute('list') || '');
      const path = m ? m[1] : '';
      const as = node.getAttribute('as') || 'item';
      return (scope) => {
        const list = lookup(path, scope);
        if (!list || !list.length) return null;
        return Array.prototype.map.call(list, (item, i) => {
          const s = Object.create(scope);
          s[as] = item;
          s.$index = i;
          return h(React.Fragment, { key: i }, kids(s));
        });
      };
    }

    const attrs = [];
    for (const a of node.attributes) {
      if (a.name.startsWith('hint-')) continue;
      const name = NAMES[a.name] || a.name;
      const raw = a.value;
      const whole = WHOLE.exec(raw);
      if (name === 'style') {
        attrs.push(raw.includes('{{') ? [name, (s) => styleObj(interp(raw, s))] : [name, ((o) => () => o)(styleObj(raw))]);
      } else if (whole) {
        const p = whole[1];
        attrs.push([name, (s) => lookup(p, s)]);
      } else if (raw.includes('{{')) {
        attrs.push([name, (s) => interp(raw, s)]);
      } else {
        const v = raw === '' && BOOL[name] ? true : raw;
        attrs.push([name, () => v]);
      }
    }
    return (scope) => {
      const props = {};
      for (const [k, f] of attrs) {
        const v = f(scope);
        if (v === undefined) continue;
        if (BOOL[k]) props[k] = v === true || v === 'true' || v === k;
        else props[k] = v;
      }
      if (tag === 'input' || tag === 'textarea') {
        // A bound value without a handler would freeze the field.
        if ('value' in props && !props.onChange) { props.defaultValue = props.value; delete props.value; }
      }
      const c = kids(scope);
      return c.length ? h(tag, props, ...c) : h(tag, props);
    };
  }

  function compileKids(node) {
    const fs = [];
    node.childNodes.forEach((n) => { const f = compile(n); if (f) fs.push(f); });
    return (scope) => {
      const out = [];
      for (const f of fs) {
        const r = f(scope);
        if (r == null || r === '') continue;
        if (Array.isArray(r)) out.push(...r); else out.push(r);
      }
      return out;
    };
  }

  const loaded = new Set();
  function applyHelmet(helmet, base) {
    if (!helmet) return;
    for (const el of helmet.children) {
      const tag = el.localName;
      if (tag !== 'link' && tag !== 'style' && tag !== 'meta') continue;
      const sig = el.outerHTML;
      if (loaded.has(sig)) continue;
      loaded.add(sig);
      const copy = document.createElement(tag);
      for (const a of el.attributes) copy.setAttribute(a.name, a.value);
      if (tag === 'link' && copy.getAttribute('href')) copy.href = new URL(el.getAttribute('href'), base).href;
      copy.textContent = el.textContent;
      document.head.appendChild(copy);
    }
  }

  async function load(url) {
    const base = new URL(url, location.href);
    const res = await fetch(base);
    if (!res.ok) throw new Error('Could not load ' + url + ' (' + res.status + ')');
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const root = doc.querySelector('x-dc');
    const scriptEl = doc.querySelector('script[data-dc-script]');
    if (!root || !scriptEl) throw new Error(url + ' is not a design component');
    applyHelmet(root.querySelector('helmet'), base);
    const template = compileKids(root);

    let defaults = {};
    try {
      const decl = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      for (const k in decl) if (k[0] !== '$' && decl[k] && 'default' in decl[k]) defaults[k] = decl[k].default;
    } catch (e) { /* no tweak defaults */ }

    class DCLogic extends React.Component {
      renderVals() { return {}; }
      render() {
        const vals = this.renderVals() || {};
        const out = template(vals);
        return out.length === 1 ? out[0] : h(React.Fragment, null, ...out);
      }
    }
    // The screen's own logic, as written in the design.
    const Component = new Function('DCLogic', 'React', '"use strict";\n' + scriptEl.textContent + '\n;return Component;')(DCLogic, React);
    return { Component, defaults, title: (doc.querySelector('title') || {}).textContent };
  }

  async function mount(container, url, props) {
    const { Component, defaults, title } = await load(url);
    if (title && !document.title) document.title = title;
    ReactDOM.createRoot(container).render(h(Component, Object.assign({}, defaults, props || {})));
  }

  window.DCLite = { mount, load };
})();
