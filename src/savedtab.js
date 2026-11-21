// The Saved tab of the search panel: a shared list (from a link), My Top 10, favorites, collections and pins.
// It draws into the panel's list each time the tab is shown and again when the saved data changes.
// Every name, own or from a link, is set with textContent only: never as HTML.

import { TOP10_ID } from './favorites.mjs';
export const EMPTY_TEXT = 'Tap ★ Save to keep a view here.';

// Subtitle for a saved view: "<kind of the followed object, else the place or scale name> · <date> · <speed>".
// d is api.saved.describe(fav); kindOf(id) gives a kind such as "Planet", or null.
export function favSubtitle(fav, d, kindOf) {
  if (!d) return '';
  const id = fav?.view?.focus;
  const kind = (typeof id === 'string' && kindOf(id)) || d.place;
  return [kind, d.date, d.speed].filter(Boolean).join(' · ');
}

// Where keyboard focus goes after the item at index i is taken out of a list of ids: the next item, else the one
// before, then the fallbacks.
export function focusAfterRemove(ids, i, keyOf, ...fallbacks) {
  return [i + 1 < ids.length ? keyOf(ids[i + 1]) : null, i > 0 ? keyOf(ids[i - 1]) : null, ...fallbacks].filter(Boolean);
}

const ICONS = { // static markup only (no data goes in here)
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  star: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
};
function svg(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const places = (n) => `${n} ${n === 1 ? 'place' : 'places'}`;

/**
 * list: the panel's <ul>. S: api.saved. toast(msg): shows a short message. close(): closes the panel. kindOf(id) → kind | null.
 * isActive() → true while the panel is open on the Saved tab.
 */
export function initSavedTab({ list, S, toast, close, kindOf, isActive }) {
  let openColl = null;     // id of the collection shown on its own, else the overview
  let editing = null;      // { kind: 'fav' | 'coll', id, draft, sel: [start, end] | null }
  let chooser = null;      // id of the favorite whose "add to a collection" chooser is open
  let menu = null;         // focus key of the ⋯ button whose row of actions is open (one at a time)
  let confirmDel = null, confirmTimer = 0; // collection waiting for a second tap on Delete
  let lastSig = null;      // what was drawn last; an unchanged onChange draws nothing
  let pending = null;      // focus keys to try after the next draw (after an action)
  let scrollTo = null;     // scroll position for the next draw (null: keep where it is)
  let overviewY = 0;       // overview scroll position while a collection is open
  let drawing = false;

  const sub = (f) => favSubtitle(f, S.describe(f), kindOf);
  function signature() {
    const d = (f) => [f.id, f.name, f.needsLookup ? 1 : 0, sub(f)];
    const s = S.shared();
    return JSON.stringify([S.list().map(d), S.colls().map((c) => [c.id, c.name, c.items.map(d)]),
      S.pins().map((p) => [p.id, p.label]), s ? [s.name, s.items.map(d)] : null]);
  }

  // ── small builders ──
  // word: a small caption under a round icon (the ⋯ menu's actions)
  function button({ fk, label, text, icon, cls, onClick, disabled = false, on = false, word }) {
    const b = el('button', cls || (word ? 'svLbl' : icon && !text ? 'svIco' : 'pill spBtn svBtn'));
    b.type = 'button';
    if (word) { const c = el('span', 'svCirc'); c.append(svg(icon)); b.append(c, el('span', 'svWord', word)); }
    else if (icon) b.append(svg(icon));
    if (text) b.append(text);
    if (label) { b.setAttribute('aria-label', label); if (icon && !text && !word) b.title = label; }
    if (fk) b.dataset.fk = fk;
    if (on) b.classList.add('on');
    if (disabled) b.disabled = true;
    b.onclick = (e) => { e.stopPropagation(); if (!b.disabled) onClick(); };
    return b;
  }
  // The ⋯ button that shows or hides a row's actions. mk is its focus key; first is the key to focus on opening.
  function moreButton(mk, name, first) {
    const open = menu === mk;
    const b = button({ fk: mk, icon: 'more', label: `More for ${name}`, on: open,
      onClick: () => { const was = menu === mk; menu = was ? null : mk; if (was && chooser) chooser = null; act(was ? [mk] : [].concat(first, mk), () => {}); } });
    b.setAttribute('aria-expanded', String(open));
    return b;
  }
  function textBlock(name, subtitle) {
    const t = el('div', 'spText');
    const n = el('span', 'spName', name); n.title = name;
    t.append(n);
    if (subtitle) t.append(el('span', 'spSub', subtitle));
    return t;
  }
  function section(frag, key, title, count, extra) {
    const li = el('li', 'svSec');
    const h = el('h3', null, title); h.tabIndex = -1; h.dataset.fk = 'sec:' + key;
    if (count) h.append(el('span', 'svCount', count));
    li.append(h);
    if (extra) li.append(extra);
    frag.append(li);
  }
  function bar(frag, buttons) {
    const li = el('li', 'svBar'); li.append(...buttons); frag.append(li);
  }
  function note(frag, text) { frag.append(el('li', 'spEmpty svNote', text)); }
  function renameInput(name) {
    const inp = el('input', 'svInput');
    inp.type = 'text'; inp.value = editing.draft; inp.dataset.fk = 'edit';
    inp.autocomplete = 'off'; inp.spellcheck = false; inp.enterKeyHint = 'done';
    inp.setAttribute('aria-label', `New name for ${name}`);
    inp.oninput = () => { if (editing) editing.draft = inp.value; };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commitEdit(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
    };
    inp.onselect = inp.onkeyup = inp.onclick = () => { if (editing) editing.sel = [inp.selectionStart, inp.selectionEnd]; };
    // Leaving the box keeps the new name. Wait a tick so focus has landed (Tab) and the redraw can keep it there.
    inp.onblur = () => { const ed = editing; if (!drawing && ed) setTimeout(() => { if (editing === ed) commitEdit(false); }, 0); };
    return inp;
  }

  // ── actions (each says where focus goes afterwards) ──
  function act(keys, fn) {
    pending = keys;
    fn();
    if (pending) draw(true); // nothing changed (a refused action): still put focus where it belongs
  }
  function go(fav) { close(); S.restore(fav); }
  function startEdit(kind, id, name, fk) {
    chooser = null; if (kind === 'fav') menu = null;
    editing = { kind, id, draft: name, sel: null, back: fk };
    pending = ['edit']; draw(true);
  }
  function commitEdit(refocus = true) {
    const ed = editing; if (!ed) return;
    editing = null;
    if ([...ed.draft.trim()].length > 60) toast?.('Names can be up to 60 characters; shortened.');
    pending = refocus ? [ed.back] : null; // after a blur, focus stays where it went
    if (ed.kind === 'fav') S.rename(ed.id, ed.draft); else S.renameColl(ed.id, ed.draft);
    draw(true); // also when the name didn't change (no onChange redraw)
  }
  function cancelEdit() {
    const ed = editing; if (!ed) return;
    editing = null; pending = [ed.back]; draw(true);
  }
  function setConfirm(id) {
    clearTimeout(confirmTimer); confirmDel = id;
    if (id) confirmTimer = setTimeout(() => { confirmDel = null; draw(true); }, 4000);
  }

  // ── rows ──
  function favRow(frag, f, i, favs, top) {
    const li = el('li', 'svRow'); li.dataset.id = f.id;
    const main = el('div', 'svMain');
    const isEd = editing?.kind === 'fav' && editing.id === f.id;
    main.append(isEd ? renameInput(f.name) : textBlock(f.name, sub(f)),
      button({ fk: `fav:${f.id}:go`, text: 'Go', label: `Go to ${f.name}`, cls: 'pill spBtn svBtn svGo', onClick: () => go(f) }));
    const mk = `fav:${f.id}:more`;
    if (!isEd) main.append(moreButton(mk, f.name, `fav:${f.id}:ren`));
    const ti = top ? top.items.findIndex((x) => x.id === f.id) : -1;
    const acts = el('div', 'svActs svMenu');
    const fk = (b) => `fav:${f.id}:${b}`;
    const addBtn = button({ fk: fk('add'), icon: 'plus', word: 'Collection', label: `Add ${f.name} to a collection`, on: chooser === f.id,
      onClick: () => {
        chooser = chooser === f.id ? null : f.id;
        const first = S.colls().find((c) => c.id !== TOP10_ID);
        act(chooser ? [first ? `ch:${first.id}` : 'ch:new'] : [fk('add')], () => {});
      } });
    addBtn.setAttribute('aria-expanded', String(chooser === f.id));
    acts.append(
      button({ fk: fk('ren'), icon: 'pencil', word: 'Rename', label: `Rename ${f.name}`, onClick: () => startEdit('fav', f.id, f.name, mk) }),
      button({ fk: fk('top'), icon: 'star', word: 'Top 10', on: ti >= 0, label: ti >= 0 ? `Remove ${f.name} from My Top 10` : `Add ${f.name} to My Top 10`,
        onClick: () => act([fk('top')], () => (ti >= 0 ? S.removeFromColl(TOP10_ID, ti) : S.addTo(TOP10_ID, f.id))) }),
      addBtn,
      button({ fk: fk('share'), icon: 'share', word: 'Share', label: `Share ${f.name}`, onClick: () => S.share(f) }),
      button({ fk: fk('del'), icon: 'trash', word: 'Delete', label: `Delete ${f.name}`,
        onClick: () => act(focusAfterRemove(favs.map((x) => x.id), i, (id) => `fav:${id}:go`, 'sec:favs', 'first'), () => {
          if (chooser === f.id) chooser = null;
          menu = null;
          S.remove(f.id);
        }) }),
    );
    li.append(main);
    if (menu === mk) li.append(acts);
    frag.append(li);
    if (menu === mk && chooser === f.id) chooserRow(frag, f);
  }
  function chooserRow(frag, f) {
    const li = el('li', 'svChooser');
    li.setAttribute('role', 'group'); li.setAttribute('aria-label', `Add ${f.name} to a collection`);
    const back = `fav:${f.id}:add`;
    const pick = (id) => act([back], () => { chooser = null; S.addTo(id, f.id); });
    for (const c of S.colls()) {
      if (c.id === TOP10_ID) continue;
      li.append(button({ fk: `ch:${c.id}`, text: c.name, label: `Add ${f.name} to ${c.name}`, cls: 'chip svChip', onClick: () => pick(c.id) }));
    }
    li.append(button({ fk: 'ch:new', icon: 'plus', text: 'New collection', label: `Add ${f.name} to a new collection`, cls: 'chip svChip svNew',
      onClick: () => act([back], () => { chooser = null; const c = S.newColl('New collection'); if (c) S.addTo(c.id, f.id); }) }));
    frag.append(li);
  }
  // An item of My Top 10 or a collection: Go, up, down, remove.
  function itemRow(frag, c, it, i, n, rank) {
    const li = el('li', 'svRow');
    const main = el('div', 'svMain');
    const key = (b) => `it:${c.id}:${it.id}:${b}`;
    if (rank) main.append(el('span', 'svRank', String(i + 1)));
    main.append(textBlock(it.name, sub(it)),
      button({ fk: key('go'), text: 'Go', label: `Go to ${it.name}`, cls: 'pill spBtn svBtn svGo', onClick: () => go(it) }),
      moreButton(key("more"), it.name, [i === 0 ? key("down") : key("up"), key("rm")]));
    const acts = el('div', 'svActs svMenu' + (rank ? ' svIndent' : ''));
    acts.append(
      button({ fk: key('up'), icon: 'up', word: 'Up', label: `Move ${it.name} up`, disabled: i === 0, onClick: () => act([key('up'), key('down')], () => S.moveInColl(c.id, i, -1)) }),
      button({ fk: key('down'), icon: 'down', word: 'Down', label: `Move ${it.name} down`, disabled: i === n - 1, onClick: () => act([key('down'), key('up')], () => S.moveInColl(c.id, i, 1)) }),
      button({ fk: key('rm'), icon: 'x', word: 'Remove', label: `Remove ${it.name} from ${c.name}`,
        onClick: () => act(focusAfterRemove(c.items.map((x) => x.id), i, (id) => `it:${c.id}:${id}:go`, c.id === TOP10_ID ? 'sec:top10' : 'coll:back', 'first'),
          () => { menu = null; S.removeFromColl(c.id, i, true); }) }),
    );
    li.append(main);
    if (menu === key('more')) li.append(acts);
    frag.append(li);
  }

  // ── views ──
  function overview(frag) {
    const favs = S.list(), colls = S.colls(), pins = S.pins(), shared = S.shared();
    const top = colls.find((c) => c.id === TOP10_ID) || { id: TOP10_ID, name: 'My Top 10', items: [] };
    const others = colls.filter((c) => c.id !== TOP10_ID);
    if (shared) {
      section(frag, 'shared', 'Shared with you', null,
        button({ fk: 'sh:close', icon: 'x', label: 'Close the shared list', cls: 'svIco svClose', onClick: () => act(['sec:top10', 'first'], () => S.closeShared()) }));
      const li = el('li', 'svShared'); li.append(textBlock(shared.name, places(shared.items.length))); frag.append(li);
      bar(frag, [
        button({ fk: 'sh:tour', text: 'Tour', label: `Tour ${shared.name}`, onClick: () => S.startListTour(shared.items) }),
        button({ fk: 'sh:save', text: 'Save to my collections', label: `Save ${shared.name} to my collections`, onClick: () => act(['sh:save'], () => S.saveShared()) }),
      ]);
      for (const it of shared.items) {
        const r = el('li', 'svRow');
        const main = el('div', 'svMain');
        main.append(textBlock(it.name, sub(it)), button({ fk: `sh:${it.id}`, text: 'Go', label: `Go to ${it.name}`, cls: 'pill spBtn svBtn svGo', onClick: () => go(it) }));
        r.append(main); frag.append(r);
      }
    }
    if (!favs.length && !top.items.length && !others.length && !shared) {
      note(frag, EMPTY_TEXT);
    } else {
      section(frag, 'top10', 'My Top 10', `${top.items.length} / 10`);
      if (top.items.length) {
        bar(frag, [
          button({ fk: 'top:share', icon: 'share', text: 'Share', label: 'Share My Top 10', onClick: () => S.share(top) }),
          button({ fk: 'top:tour', text: 'Tour', label: 'Tour My Top 10', onClick: () => S.startListTour(top.items) }),
        ]);
        top.items.forEach((it, i) => itemRow(frag, top, it, i, top.items.length, true));
      } else note(frag, 'Tap ★ on a favorite to rank it here.');

      section(frag, 'favs', 'Favorites', favs.length ? String(favs.length) : null);
      if (favs.length) favs.forEach((f, i) => favRow(frag, f, i, favs, top));
      else note(frag, 'No favorites yet. Tap ★ Save to keep a view.');

      section(frag, 'colls', 'Collections', others.length ? String(others.length) : null);
      if (others.length) {
        for (const c of others) {
          const li = el('li', 'svRow svCollItem');
          const b = button({ fk: `coll:${c.id}`, cls: 'svColl', label: `Open ${c.name}, ${places(c.items.length)}`,
            onClick: () => { overviewY = list.scrollTop; openColl = c.id; chooser = null; menu = null; scrollTo = 0; pending = ['coll:back']; draw(true); } });
          b.append(textBlock(c.name, places(c.items.length)), svg('next'));
          li.append(b); frag.append(li);
        }
      } else note(frag, 'Tap + on a favorite to start a collection.');
    }
    if (pins.length) {
      section(frag, 'pins', 'Pins', String(pins.length));
      for (const p of pins) {
        const li = el('li', 'svRow');
        const main = el('div', 'svMain');
        main.append(textBlock(p.label, `Pin ${p.id}`),
          button({ fk: `pin:${p.id}`, text: 'Keep', label: `Keep pin ${p.id}, ${p.label}, as a favorite`, cls: 'pill spBtn svBtn svGo',
            onClick: () => act([`pin:${p.id}`], () => S.keepPin(p.id)) }));
        li.append(main); frag.append(li);
      }
    }
  }
  function collView(frag, c, colls) {
    const head = el('li', 'svHead');
    const back = () => { const id = c.id; openColl = null; editing = null; menu = null; setConfirm(null); scrollTo = overviewY; pending = [`coll:${id}`, 'sec:colls']; draw(true); };
    head.append(button({ fk: 'coll:back', icon: 'back', text: 'Saved', label: 'Back to Saved', cls: 'pill spBtn svBtn svBack', onClick: back }));
    frag.append(head);
    if (editing?.kind === 'coll' && editing.id === c.id) {
      const li = el('li', 'svSec'); li.append(renameInput(c.name)); frag.append(li);
    } else section(frag, 'coll', c.name, places(c.items.length));
    const empty = !c.items.length, del = confirmDel === c.id;
    bar(frag, [
      button({ fk: 'coll:share', icon: 'share', text: 'Share', label: `Share ${c.name}`, disabled: empty, onClick: () => S.share(c) }),
      button({ fk: 'coll:tour', text: 'Tour', label: `Tour ${c.name}`, disabled: empty, onClick: () => S.startListTour(c.items) }),
      button({ fk: 'coll:ren', icon: 'pencil', text: 'Rename', label: `Rename ${c.name}`, onClick: () => startEdit('coll', c.id, c.name, 'coll:ren') }),
      button({ fk: 'coll:del', icon: 'trash', text: del ? 'Tap again to delete' : 'Delete', label: del ? `Confirm: delete ${c.name}` : `Delete ${c.name}`,
        cls: 'pill spBtn svBtn' + (del ? ' svWarn' : ''),
        onClick: () => {
          if (!del) { setConfirm(c.id); act(['coll:del'], () => {}); return; }
          setConfirm(null);
          const others = colls.filter((x) => x.id !== TOP10_ID).map((x) => x.id);
          const keys = focusAfterRemove(others, others.indexOf(c.id), (id) => `coll:${id}`, 'sec:colls', 'first');
          openColl = null; editing = null; scrollTo = overviewY;
          act(keys, () => S.removeColl(c.id));
        } }),
    ]);
    if (c.items.length) c.items.forEach((it, i) => itemRow(frag, c, it, i, c.items.length, false));
    else note(frag, 'Nothing here yet. Tap + on a favorite to add it.');
  }

  // ── drawing ──
  // While a finger or mouse button is down on the list, a redraw would remove the control about to be clicked, so
  // it waits until just after the click.
  let holding = false, deferred = null;
  list.addEventListener('pointerdown', () => { holding = true; }, true);
  const release = () => {
    if (!holding) return;
    holding = false;
    setTimeout(() => { if (deferred !== null && !holding) { const f = deferred; deferred = null; draw(f); } }, 0);
  };
  addEventListener('pointerup', release, true); addEventListener('pointercancel', release, true);
  function draw(force = false) {
    if (!isActive()) return;
    if (holding) { deferred = deferred || force; return; }
    const sig = signature();
    if (!force && sig === lastSig) return; // onChange with nothing new: leave the list (and focus) alone
    lastSig = sig;
    const active = document.activeElement;
    const inList = active && list.contains(active);
    if (inList && active.classList.contains('svInput') && editing) editing.sel = [active.selectionStart, active.selectionEnd];
    const keys = pending || (inList && active.dataset.fk ? [active.dataset.fk] : null);
    pending = null;
    const y = scrollTo ?? list.scrollTop; scrollTo = null;

    drawing = true;
    const frag = document.createDocumentFragment();
    const colls = S.colls();
    const c = openColl && colls.find((x) => x.id === openColl && x.id !== TOP10_ID);
    if (openColl && !c) { openColl = null; editing = editing?.kind === 'coll' ? null : editing; }
    if (c) collView(frag, c, colls); else overview(frag);
    list.textContent = '';
    list.append(frag);
    list.scrollTop = y;
    drawing = false;

    if (keys) {
      const all = [...list.querySelectorAll('[data-fk]')];
      for (const k of keys) {
        const t = k === 'first' ? list.querySelector('button:not(:disabled), input') : all.find((x) => x.dataset.fk === k && !x.disabled);
        if (!t) continue;
        t.focus({ preventScroll: true });
        if (t.classList.contains('svInput')) { const [a, b] = editing?.sel || [t.value.length, t.value.length]; try { t.setSelectionRange(a, b); } catch { } }
        // keep the focused control in view (focus() alone would jump the list around)
        const lr = list.getBoundingClientRect(), tr = t.getBoundingClientRect();
        if (tr.top < lr.top) list.scrollTop -= lr.top - tr.top + 8; else if (tr.bottom > lr.bottom) list.scrollTop += tr.bottom - lr.bottom + 8;
        break;
      }
    }
  }

  return {
    // Shown (tab picked or panel opened): start from the overview.
    show() { openColl = null; editing = null; chooser = null; menu = null; setConfirm(null); pending = null; scrollTo = 0; lastSig = null; draw(true); },
    draw: () => draw(false),
    // Esc inside the tab: closes the rename box or the chooser first. → true if it used the Esc.
    esc() {
      if (editing) { cancelEdit(); return true; }
      if (chooser) { const id = chooser; chooser = null; pending = [`fav:${id}:add`]; draw(true); return true; }
      if (menu) { const mk = menu; menu = null; pending = [mk]; draw(true); return true; }
      if (confirmDel) { setConfirm(null); draw(true); return true; }
      return false;
    },
    leave() { editing = null; chooser = null; menu = null; setConfirm(null); lastSig = null; },
  };
}
