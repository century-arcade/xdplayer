/* <xd-crossword>: a small crossword player for a web page. One file, no dependencies.
 *
 *   <script src="xd-crossword.js"></script>
 *   <xd-crossword src="puzzle.xd"></xd-crossword>
 *
 * or with the puzzle in the page, which needs no server:
 *
 *   <xd-crossword><script type="text/xd">
 *   Title: ...
 *   </script></xd-crossword>
 *
 * Three parts: parse() reads .xd, Solver is the puzzle and its keyboard with no DOM (so it can be tested alone),
 * and the element draws a Solver. https://github.com/century-arcade/xdformat has the format.
 */
(function (root) {
  'use strict';

  const norm = s => s.normalize('NFC').toUpperCase();

  // ---- .xd ----

  function sections(text) {
    const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    const found = {metadata: [], grid: [], clues: [], design: []};
    if (lines.some(l => /^##\s+\S/.test(l))) {      // a grid line can start with ## too, but has no space in it
      let cur = null;
      for (const l of lines) {
        const h = l.match(/^##\s+(.*?)\s*$/);
        if (h) cur = found[h[1].toLowerCase()] || null;
        else if (cur) cur.push(l);
      }
      return found;
    }
    // no headings: two or more blank lines between sections, in a fixed order
    const parts = lines.join('\n').trim().split(/\n[ \t]*\n(?:[ \t]*\n)+/);
    ['metadata', 'grid', 'clues'].forEach((name, i) => { if (parts[i]) found[name] = parts[i].split('\n'); });
    return found;
  }

  function parseDesign(lines) {
    const src = lines.join('\n'), styles = {}, rule = /([^\s{}]+(?:\s*,\s*[^\s{}]+)*)\s*\{((?:[^}'"]|'[^']*'|"[^"]*")*)\}/y;
    let at = 0;
    for (;;) {
      const space = /\s*/y; space.lastIndex = at; space.exec(src);
      rule.lastIndex = space.lastIndex;
      const m = rule.exec(src);
      if (!m) { at = space.lastIndex; break; }
      at = rule.lastIndex;
      const props = {};
      for (const p of m[2].split(';')) {
        const i = p.indexOf(':');
        if (i > 0) props[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
      }
      for (const k of m[1].split(',')) Object.assign(styles[k.trim()] ||= {}, props);
    }
    return {styles, rows: src.slice(at).split('\n').map(l => [...l.trim()]).filter(l => l.length)};
  }

  function parse(text) {
    const s = sections(String(text)), meta = {};
    for (const l of s.metadata) {
      const m = l.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
      if (m) meta[m[1].toLowerCase()] = m[2];
    }
    const rebus = {};                                 // key: its values, more than one for a Schrödinger cell
    for (const pair of (meta.rebus || '').split(/\s+/)) {
      const m = pair.match(/^(.)=(.*)$/u);
      if (m) (rebus[m[1]] ||= []).push(m[2]);
    }
    const rows = s.grid.map(l => l.trim()).filter(Boolean).map(l => [...l]);
    if (!rows.length) throw new Error('no grid in this .xd');
    const clues = [];
    for (const l of s.clues) {
      const t = l.trim(), m = t.match(/^([AD]?)([^.\s^]+)\.\s*(.*)$/s);
      if (!m) continue;                               // blank, or clue metadata (A1 ^Refs: ...)
      const [body, ...answers] = m[3].split(' ~ ');
      clues.push({dir: m[1], ref: m[2], body: body.trim(), answers: answers.map(a => a.trim().split(/\s+/)[0])});
    }
    return {meta, rebus, rows, clues, design: parseDesign(s.design)};
  }

  // what a rebus value accepts. v4 lists Schrödinger readings as repeated keys; older files write a/b (either reading,
  // or one each way: the file doesn't say which, so accept both) and a|b. A value that is just / or | is that character.
  function readings(values) {
    const out = [];
    for (const v of values) {
      if (v === '' || !/[^/|][/|][^/|]|[^/|]\/[^/|]/.test(v)) { out.push(v); continue; }
      const halves = v.split('/');
      for (const h of halves) out.push(h.replace(/\|/g, ''), ...h.split('|'));
      if (halves.every(h => h.length === 1)) out.push(halves.join(''));
    }
    return [...new Set(out.map(norm))];
  }

  // ---- xdown: the inline markup in clues and metadata ----

  const PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~', TEXT = '/*_-~^=';

  function spanEnd(s, i) {                            // s[i] is the { of a span: the index of its closing type char
    const t = s[i + 1];
    if (t === '\\') { const e = s.indexOf('\\}', i + 2); return e; }
    for (let j = i + 2; j < s.length; j++) {
      if (s[j] === t && s[j + 1] === '}') return j;
      if (s[j] === '{' && PUNCT.includes(s[j + 1] || ' ')) { const e = spanEnd(s, j); if (e > 0) j = e + 1; }
    }
    return -1;
  }

  function xdown(s) {
    const out = [];
    let i = 0, text = '';
    const flush = () => { if (text) out.push(text); text = ''; };
    while (i < s.length) {
      const t = s[i + 1], e = s[i] === '{' && t && (TEXT + '@!\\').includes(t) ? spanEnd(s, i) : -1;
      if (e < 0) { text += s[i++]; continue; }
      const inner = s.slice(i + 2, e);
      if (t === '\\') {
        if (inner) text += inner; else { flush(); out.push({t: 'br'}); }
      } else if (t === '@' || t === '!') {
        flush();
        let bar = -1;
        for (let j = 0; j < inner.length; j++) {
          if (inner[j] === '|') { bar = j; break; }
          if (inner[j] === '{' && PUNCT.includes(inner[j + 1] || ' ')) { const f = spanEnd(inner, j); if (f > 0) j = f + 1; }
        }
        const attrs = {};
        for (const m of (bar < 0 ? '' : inner.slice(bar + 1)).matchAll(/([\w-]+)\s*:\s*('[^']*'|[^;]*)/g)) attrs[m[1]] = m[2].trim().replace(/^'|'$/g, '');
        out.push({t, kids: xdown(bar < 0 ? inner : inner.slice(0, bar).trim()), attrs});
      } else {
        flush();
        out.push({t, kids: xdown(inner)});
      }
      i = e + 2;
    }
    flush();
    return out;
  }

  const plain = nodes => nodes.map(n => typeof n === 'string' ? n : n.t === 'br' ? ' ' : plain(n.kids)).join('');

  // ---- the puzzle and its keyboard ----

  class Solver {
    constructor(text) {
      const p = this.puzzle = typeof text === 'string' ? parse(text) : text;
      this.H = p.rows.length;
      this.W = Math.max(...p.rows.map(r => r.length));
      this.cells = [];
      const circles = /circle/i.test(p.meta.special || ''), shades = /shad/i.test(p.meta.special || '');
      for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
        const ch = p.rows[r][c] ?? '_';
        const k = {r, c, val: '', mark: '', A: null, D: null, num: '', void: ch === '_', block: ch === '#' || ch === '.'};
        const style = p.design.styles[p.design.rows[r]?.[c]] || {};
        if (style.background === 'circle') k.circle = true;
        if (style.background === 'shaded') k.shaded = true;
        if (style['bar-top'] === 'true') k.barT = true;
        if (style['bar-left'] === 'true') k.barL = true;
        if (!k.void && !k.block) {
          const lower = /^[a-z]$/.test(ch);           // v3: a lowercase cell is special, by the Special field
          if (lower && circles) k.circle = true;
          if (lower && shades) k.shaded = true;
          k.accept = p.rebus[ch] ? readings(p.rebus[ch]) : [norm(ch)];
          k.blankOk = k.accept.includes('');
        }
        this.cells.push(k);
      }
      this.words = {A: [], D: []};
      this.number();
      this.attachClues();
      this.all = [...this.words.A, ...this.words.D];
      this.pos = this.cells.find(k => k.A || k.D);
      if (!this.pos) throw new Error('no entries in this grid');
      this.dir = this.pos.A ? 'A' : 'D';
      this.rebus = null;                              // the letters typed so far in a rebus square, when in one
      this.solved = false;
      this.wrong = false;
    }

    at(r, c) { return r >= 0 && r < this.H && c >= 0 && c < this.W ? this.cells[r * this.W + c] : null; }
    open(r, c) { const k = this.at(r, c); return k && !k.void && !k.block ? k : null; }

    number() {
      const after = (k, d) => {                       // the next square of an entry, unless a bar ends it
        const n = d === 'A' ? this.open(k.r, k.c + 1) : this.open(k.r + 1, k.c);
        return n && !(d === 'A' ? n.barL : n.barT) ? n : null;
      };
      const before = (k, d) => {
        if (d === 'A' ? k.barL : k.barT) return null;
        return d === 'A' ? this.open(k.r, k.c - 1) : this.open(k.r - 1, k.c);
      };
      let n = 0;
      for (const k of this.cells) {
        if (k.void || k.block) continue;
        const starts = [...'AD'].filter(d => !before(k, d) && after(k, d));
        if (!starts.length) continue;
        k.num = String(++n);
        for (const d of starts) {
          const w = {dir: d, num: k.num, label: k.num, sq: [], clue: []};
          for (let x = k; x; x = after(x, d)) { w.sq.push(x); x[d] = w; }
          this.words[d].push(w);
        }
      }
    }

    attachClues() {
      const given = {A: [], D: []};
      for (const c of this.puzzle.clues) for (const d of c.dir ? [c.dir] : 'AD') given[d].push(c);
      for (const d of 'AD') {
        const words = this.words[d], byNum = Object.fromEntries(words.map(w => [w.num, w]));
        const refs = [...new Set(given[d].map(c => c.ref))];
        if (refs.every(r => byNum[r])) { for (const c of given[d]) byNum[c.ref].clue.push(c.body); continue; }
        // numbered some other way, as old puzzles were: if the counts agree, go in order and show the printed numbers
        if (refs.length !== words.length) continue;
        refs.forEach((r, i) => {
          words[i].label = r;
          words[i].sq[0].num = r.split(/\D/)[0] || r;
          words[i].clue = given[d].filter(c => c.ref === r).map(c => c.body);
        });
      }
      for (const w of [...this.words.A, ...this.words.D]) w.clue = w.clue.join(' / ');
    }

    get word() { return this.pos[this.dir]; }
    blank(k) { return !k.val && !k.blankOk; }
    full(w) { return !w.sq.some(k => this.blank(k)); }
    get filled() { return this.all.every(w => this.full(w)); }

    go(k, d) {
      if (!k || k.void || k.block || !(k.A || k.D)) return;
      if (d && k[d]) this.dir = d;
      else if (!k[this.dir]) this.dir = this.dir === 'A' ? 'D' : 'A';
      this.pos = k;
    }
    turn() { const d = this.dir === 'A' ? 'D' : 'A'; if (this.pos[d]) this.dir = d; }

    click(k) { if (k === this.pos) this.turn(); else this.go(k); }
    clickWord(w) { this.go(w.sq.find(k => this.blank(k)) || w.sq[0], w.dir); }

    set(k, v, mark = '') { k.val = v; k.mark = mark; }

    // after a letter: on to the next blank in the entry, back to one earlier in it, or, the entry done, to the next
    // entry that needs something. A letter typed over a full entry is a correction, so it only moves one square.
    letter(v) {
      if (this.solved) return;
      const w = this.word, i = w.sq.indexOf(this.pos), wasFull = this.full(w);
      this.set(this.pos, v);
      if (wasFull) this.go(w.sq[i + 1] || this.pos, this.dir);
      else {
        const next = w.sq.slice(i + 1).find(k => this.blank(k)) || w.sq.find(k => this.blank(k));
        if (next) this.go(next, this.dir);
        else if (!this.filled) this.tab(1);
      }
      this.finish();
    }

    backspace() {
      if (this.solved) return;
      if (this.pos.val) return this.set(this.pos, '');
      const w = this.word, prev = w.sq[w.sq.indexOf(this.pos) - 1];
      if (prev) { this.set(prev, ''); this.go(prev, this.dir); }
    }

    // arrows: one that crosses the entry turns to face that way and stays put; one along it moves, over black squares
    arrow(dr, dc) {
      const d = dr ? 'D' : 'A';
      if (d !== this.dir && this.pos[d]) { this.dir = d; return; }
      for (let r = this.pos.r + dr, c = this.pos.c + dc; this.at(r, c); r += dr, c += dc)
        if (this.open(r, c)) return this.go(this.at(r, c), d);
    }

    // Shift-arrows strafe: move without turning. Along the entry, to the start of the next one that way; across it, to
    // the nearest square that way in an entry of this direction.
    strafe(dr, dc) {
      const along = (this.dir === 'A') === (dc !== 0), w = this.word;
      for (let r = this.pos.r + dr, c = this.pos.c + dc; this.at(r, c); r += dr, c += dc) {
        const k = this.open(r, c), x = k && k[this.dir];
        if (x && x !== w) return this.go(along ? x.sq[0] : k, this.dir);
      }
    }

    tab(by) {                                         // the next entry with a blank; with none, just the next entry
      const n = this.all.length, at = this.all.indexOf(this.word);
      const pick = i => this.all[(at + by * i + n * n) % n];
      for (let i = 1; i <= n; i++) if (!this.full(pick(i))) return this.clickWord(pick(i));
      this.clickWord(pick(1));
    }

    startRebus() { if (!this.solved) this.rebus = this.pos.val; }
    endRebus() {
      const v = this.rebus;
      this.rebus = null;
      if (v) this.letter(v);
    }

    // a key: true if it was for us. Letters and digits fill; symbols go in through a rebus square.
    key(k, shift) {
      if (this.rebus !== null) {
        if (k === 'Enter' || k === 'Escape' || k === 'Tab') this.endRebus();
        else if (k === 'Backspace') this.rebus = this.rebus.slice(0, -1);
        else if ([...k].length === 1 && k !== ' ') this.rebus += norm(k);
        else return false;
        return true;
      }
      const arrows = {ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0]};
      if (arrows[k]) shift ? this.strafe(...arrows[k]) : this.arrow(...arrows[k]);
      else if (k === 'Tab' || k === 'Enter') this.tab(shift ? -1 : 1);
      else if (k === ' ') this.turn();
      else if (k === 'Backspace') this.backspace();
      else if (k === 'Delete') { if (!this.solved) this.set(this.pos, ''); }
      else if (k === 'Home') this.go(this.word.sq[0], this.dir);
      else if (k === 'End') this.go(this.word.sq[this.word.sq.length - 1], this.dir);
      else if (k === 'Escape') this.startRebus();
      else if (/^[\p{L}\p{N}]$/u.test(k)) this.letter(norm(k));
      else return false;
      return true;
    }

    right(k) { return k.accept.includes(k.val); }
    squares() { return this.cells.filter(k => k.A || k.D); }

    finish() {
      this.wrong = false;
      if (!this.filled) return;
      if (this.squares().every(k => this.right(k))) this.solved = true;
      else this.wrong = true;
    }
    check() { for (const k of this.squares()) if (k.val && !this.right(k)) k.mark = 'bad'; }
    reveal(cells) {
      if (this.solved) return;
      for (const k of cells) if (!this.right(k)) this.set(k, k.accept[0], 'shown');
      this.finish();
    }
    clear() {
      for (const k of this.squares()) this.set(k, '');
      this.solved = this.wrong = false;
      this.rebus = null;
    }

    get state() { return this.squares().map(k => [k.val, k.mark]); }
    set state(saved) {
      this.squares().forEach((k, i) => { if (saved[i]) [k.val, k.mark] = saved[i]; });
      this.finish();
    }
  }

  // ---- the element ----

  const STYLE = `
  :host { display: block; --xd-ink: #1a1a19; --xd-muted: #76756f; --xd-bg: transparent; --xd-cell: #fff; --xd-block: #1a1a19;
    --xd-line: #1a1a19; --xd-word: #fdf0c2; --xd-cursor: #f7d56b; --xd-bad: #b3261e; --xd-good: #1a7f37; --xd-shown: #2a78d6;
    --xd-shade: #d9d8d2; --xd-max-cell: 40px; color: var(--xd-ink); background: var(--xd-bg);
    font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  @media (prefers-color-scheme: dark) { :host { --xd-ink: #f1f0ea; --xd-muted: #9b9a93; --xd-cell: #2c2c2a; --xd-block: #0e0e0d;
    --xd-line: #4e4d48; --xd-word: #3a3218; --xd-cursor: #6b5718; --xd-bad: #f2877f; --xd-good: #56d364; --xd-shown: #6aa5ee; --xd-shade: #45443f; } }
  :host([theme="light"]) { --xd-ink: #1a1a19; --xd-muted: #76756f; --xd-cell: #fff; --xd-block: #1a1a19; --xd-line: #1a1a19;
    --xd-word: #fdf0c2; --xd-cursor: #f7d56b; --xd-bad: #b3261e; --xd-good: #1a7f37; --xd-shown: #2a78d6; --xd-shade: #d9d8d2; }
  * { box-sizing: border-box; }
  .wrap { container-type: inline-size; }
  header { margin: 0 0 10px; }
  h2 { font-size: 18px; line-height: 1.25; margin: 0; }
  .by { color: var(--xd-muted); font-size: 13px; }
  .body { display: flex; flex-direction: column; gap: 16px; }
  .play { position: relative; width: max-content; max-width: 100%; }
  .bar { display: flex; align-items: stretch; gap: 4px; margin: 0 0 8px; min-height: 2.9em; position: sticky; top: 0; z-index: 2;
    background: var(--xd-word); border-radius: 4px; }
  .now { flex: 1; min-width: 0; padding: 4px 8px; border: 0; background: none; color: inherit; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
  .now b { font-weight: 700; margin-right: .3em; }
  .step { border: 0; background: none; color: inherit; font-size: 20px; padding: 0 10px; cursor: pointer; }
  .grid { display: grid; width: max-content; user-select: none; -webkit-user-select: none; touch-action: manipulation;
    --cs: min(var(--xd-max-cell), calc((100cqw - 2px) / var(--w))); grid-template-columns: repeat(var(--w), var(--cs)); grid-auto-rows: var(--cs); }
  .k { position: relative; display: flex; align-items: flex-end; justify-content: center; cursor: pointer; background: var(--xd-cell);
    outline: 1px solid var(--xd-line); margin: 0 1px 1px 0; font-size: calc(var(--cs) * .56); line-height: 1.2; overflow: hidden; }
  .k.block { background: var(--xd-block); cursor: default; }
  .k.void { background: none; outline: 0; cursor: default; }
  .k.shaded { background: var(--xd-shade); }
  .k.word { background: var(--xd-word); }
  .k.cur { background: var(--xd-cursor); }
  .k.bad { color: var(--xd-bad); }
  .k.bad::after { content: ""; position: absolute; inset: 0; opacity: .5;
    background: linear-gradient(to top right, transparent 48%, var(--xd-bad) 49%, var(--xd-bad) 51%, transparent 52%); }
  .k.shown { color: var(--xd-shown); }
  .k.long { font-size: calc(var(--cs) * 1.1 / var(--n)); white-space: nowrap; }
  .k.circle::before { content: ""; position: absolute; inset: 1px; border: 1px solid var(--xd-muted); border-radius: 50%; }
  .k.barL { box-shadow: inset 2px 0 var(--xd-line); }
  .k.barT { box-shadow: inset 0 2px var(--xd-line); }
  .k.barL.barT { box-shadow: inset 2px 2px var(--xd-line); }
  .k i { position: absolute; top: 1px; left: 2px; font: normal calc(var(--cs) * .26)/1 system-ui, sans-serif; }
  .key { position: absolute; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; font-size: 16px; pointer-events: none; }
  .tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
  .tools button { font: inherit; font-size: 13px; padding: 3px 9px; cursor: pointer; color: inherit; background: none;
    border: 1px solid var(--xd-muted); border-radius: 4px; }
  .tools button[aria-pressed="true"] { background: var(--xd-cursor); }
  .say { min-height: 1.4em; margin: 8px 0 0; font-weight: 600; }
  .say.ok { color: var(--xd-good); }
  .say.no { color: var(--xd-bad); }
  .clues { display: flex; gap: 16px; font-size: 14px; min-width: 0; flex: 1; }
  .clues > section { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }
  h3 { font-size: 12px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .05em; color: var(--xd-muted); }
  ol { list-style: none; margin: 0; padding: 0; overflow-y: auto; position: relative; }
  li { display: flex; gap: .4em; padding: 2px 4px; cursor: pointer; border-radius: 3px; }
  li > b { flex: 0 0 auto; min-width: 1.5em; text-align: right; }
  li.on { background: var(--xd-word); }
  li.cross { box-shadow: inset 3px 0 var(--xd-cursor); }
  li.done > span { color: var(--xd-muted); }
  .credit { color: var(--xd-muted); font-size: 12px; margin: 10px 0 0; }
  a { color: inherit; }
  img { max-width: 100%; vertical-align: middle; }
  @container (min-width: 700px) {
    .body { flex-direction: row; align-items: flex-start; }
    .grid { --cs: min(var(--xd-max-cell), calc((60cqw - 2px) / var(--w))); }
  }`;

  const TAGS = {'/': 'em', '*': 'strong', _: 'u', '-': 's', '~': 'sub', '^': 'sup'};

  function nodes(list) {                              // xdown to DOM. Text stays text, so a puzzle can't put HTML here
    const f = document.createDocumentFragment();
    for (const n of list) {
      if (typeof n === 'string') { f.append(n); continue; }
      if (n.t === 'br') { f.append(document.createElement('br')); continue; }
      if (n.t === '@') {
        const a = document.createElement('a');
        a.append(nodes(n.kids));
        if (/^(https?:|mailto:)/i.test(n.attrs.href || '')) { a.href = n.attrs.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        f.append(a);
      } else if (n.t === '!') {
        const src = n.attrs.src || '';
        if (!/^(https?:|data:image\/)/i.test(src)) { f.append(nodes(n.kids)); continue; }
        const img = document.createElement('img');
        img.src = src; img.alt = plain(n.kids);
        for (const a of ['width', 'height']) if (n.attrs[a]) img.setAttribute(a, n.attrs[a]);
        if (n.attrs.display === 'block') img.style.display = 'block';
        f.append(img);
      } else {
        const e = document.createElement(TAGS[n.t] || 'span');
        if (n.t === '=') e.style.fontVariant = 'small-caps';
        e.append(nodes(n.kids));
        f.append(e);
      }
    }
    return f;
  }

  const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids); return e; };

  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }

  if (root.HTMLElement && root.customElements) {
    class XdCrossword extends root.HTMLElement {
      static get observedAttributes() { return ['src']; }

      connectedCallback() {
        if (this.ready) return;
        this.ready = true;
        this.attachShadow({mode: 'open'}).append(el('style', '', STYLE), this.wrap = el('div', 'wrap'));
        // a script tag in <head> runs this before the children are parsed
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => this.load(), {once: true});
        else this.load();
      }
      attributeChangedCallback() { if (this.ready) this.load(); }

      async load() {
        try {
          const src = this.getAttribute('src');
          let text;
          if (src) {
            const r = await fetch(src);
            if (!r.ok) throw new Error(`${src}: ${r.status}`);
            text = await r.text();
          } else text = (this.querySelector('script[type="text/xd"]') || this).textContent;
          this.show(text);
        } catch (e) {
          this.wrap.replaceChildren(el('p', '', `Couldn't load this crossword. ${e.message}`));
          console.error(e);
        }
      }

      get store() { return this.hasAttribute('nosave') ? null : `xd-crossword:${hash(this.s.puzzle.rows.flat().join(''))}`; }
      restore() {
        try { const v = this.store && root.localStorage.getItem(this.store); if (v) this.s.state = JSON.parse(v); } catch (e) { /* no storage here */ }
      }
      save() {
        try { if (this.store) root.localStorage.setItem(this.store, JSON.stringify(this.s.state)); } catch (e) { /* no storage here */ }
      }

      /** Draw a puzzle given as .xd text. */
      show(text) {
        const s = this.s = new Solver(text), m = s.puzzle.meta;
        this.announced = false;
        this.restore();
        const head = el('header', '');
        if (m.title) head.append(el('h2', '', nodes(xdown(m.title))));
        const by = [m.author, m.editor && `ed. ${m.editor}`, m.date].filter(Boolean).join(' · ');
        if (by) head.append(el('div', 'by', nodes(xdown(by))));

        this.now = el('button', 'now'); this.now.type = 'button';
        this.now.onclick = () => this.act(() => s.turn());
        const step = (t, by, label) => {
          const b = el('button', 'step', t);
          b.type = 'button'; b.setAttribute('aria-label', label);
          b.onclick = () => this.act(() => s.tab(by));
          return b;
        };
        const bar = el('div', 'bar', step('‹', -1, 'Previous clue'), this.now, step('›', 1, 'Next clue'));

        this.gridEl = el('div', 'grid');
        this.gridEl.setAttribute('role', 'grid');
        this.gridEl.setAttribute('aria-label', 'Crossword grid');
        this.gridEl.style.setProperty('--w', s.W);
        this.gridEl.replaceChildren(...s.cells.map((k, i) => {
          const e = el('div', 'k');
          e.dataset.i = i;
          e.setAttribute('role', 'gridcell');
          if (k.block) e.classList.add('block');
          if (k.void) e.classList.add('void');
          for (const f of ['circle', 'shaded', 'barL', 'barT']) if (k[f]) e.classList.add(f);
          if (k.num) e.append(el('i', '', k.num));
          k.text = document.createTextNode('');
          e.append(k.text);
          k.el = e;
          return e;
        }));
        this.gridEl.onclick = e => {
          const t = e.target.closest('[data-i]');
          if (!t) return;
          const k = s.cells[+t.dataset.i], active = this.shadowRoot.activeElement === this.keyEl;
          this.act(() => active ? s.click(k) : s.go(k));   // the click that starts solving doesn't turn the first square
        };

        this.keyEl = el('input', 'key');
        Object.assign(this.keyEl, {autocomplete: 'off', autocapitalize: 'characters', spellcheck: false});
        this.keyEl.setAttribute('autocorrect', 'off');
        this.keyEl.onkeydown = e => this.keydown(e);
        this.keyEl.addEventListener('beforeinput', e => this.beforeinput(e));   // phones send these, not useful keydowns

        const tool = (t, f) => { const b = el('button', '', t); b.type = 'button'; b.onclick = () => this.act(f); return b; };
        const tools = el('div', 'tools');
        this.rebusBtn = tool('Rebus', () => s.rebus === null ? s.startRebus() : s.endRebus());
        tools.append(tool('Check', () => s.check()), tool('Reveal square', () => s.reveal([s.pos])),
          tool('Reveal all', () => { if (confirm('Reveal the whole puzzle?')) s.reveal(s.squares()); }),
          tool('Clear', () => { if (confirm('Clear the grid?')) s.clear(); }), this.rebusBtn);
        if (this.hasAttribute('notools')) tools.hidden = true;

        this.say = el('p', 'say');
        this.say.setAttribute('aria-live', 'polite');

        const lists = el('div', 'clues');
        for (const [d, name] of [['A', 'Across'], ['D', 'Down']]) {
          const ol = el('ol', '');
          for (const w of s.words[d]) {
            w.li = el('li', '', el('b', '', w.label), el('span', '', nodes(xdown(w.clue))));
            w.li.onclick = () => this.act(() => s.clickWord(w));
            ol.append(w.li);
          }
          lists.append(el('section', '', el('h3', '', name), ol));
        }

        this.wrap.replaceChildren(head, el('div', 'body', el('div', 'play', bar, this.gridEl, this.keyEl, tools, this.say), lists));
        if (m.copyright || m.notes) this.wrap.append(el('p', 'credit', nodes(xdown([m.copyright, m.notes].filter(Boolean).join(' · ')))));
        this.paint();
        this.sizeClues();
        new ResizeObserver(() => this.sizeClues()).observe(this.gridEl);
      }

      sizeClues() {                                   // side by side, the clue lists are as tall as the grid
        const h = this.gridEl.getBoundingClientRect().height, wide = this.wrap.clientWidth >= 700;
        for (const ol of this.wrap.querySelectorAll('ol')) ol.style.maxHeight = wide ? `${Math.max(h, 320)}px` : '';
      }

      act(f) {
        f();
        this.after();
        this.keyEl.focus({preventScroll: true});
      }
      after() { this.paint(); this.save(); }

      keydown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        if (this.s.key(e.key, e.shiftKey)) { e.preventDefault(); this.after(); }
      }
      beforeinput(e) {
        e.preventDefault();
        if (e.inputType === 'deleteContentBackward') this.s.key('Backspace');
        else for (const ch of e.data || '') this.s.key(ch);
        this.after();
      }

      paint() {
        const s = this.s, w = s.word;
        for (const k of s.cells) {
          if (!k.A && !k.D) continue;
          const v = k === s.pos && s.rebus !== null ? s.rebus : k.val, n = [...v].length;
          k.text.data = v;
          k.el.classList.toggle('word', w.sq.includes(k));
          k.el.classList.toggle('cur', k === s.pos);
          k.el.classList.toggle('bad', k.mark === 'bad');
          k.el.classList.toggle('shown', k.mark === 'shown');
          k.el.classList.toggle('long', n > 1);
          if (n > 1) k.el.style.setProperty('--n', Math.max(n, 2));
        }
        for (const x of s.all) {
          const on = x === w;
          x.li.classList.toggle('on', on);
          x.li.classList.toggle('cross', !on && x === s.pos[x.dir]);
          x.li.classList.toggle('done', s.full(x));
          if (on || x === s.pos[x.dir]) this.reveal(x.li);
        }
        const name = `${w.label} ${w.dir === 'A' ? 'Across' : 'Down'}`;
        this.now.replaceChildren(el('b', '', name), nodes(xdown(w.clue)));
        this.keyEl.setAttribute('aria-label', `${name}: ${plain(xdown(w.clue))}. ${w.sq.length} letters`);
        this.keyEl.style.left = `${s.pos.el.offsetLeft}px`;
        this.keyEl.style.top = `${s.pos.el.offsetTop}px`;
        this.rebusBtn.setAttribute('aria-pressed', String(s.rebus !== null));
        this.say.className = 'say' + (s.solved ? ' ok' : s.wrong ? ' no' : '');
        this.say.textContent = s.solved ? 'Solved!' : s.wrong ? 'Not quite: something’s off.' : '';
        if (s.solved && !this.announced) {
          this.announced = true;
          this.dispatchEvent(new CustomEvent('xd-solved', {bubbles: true, composed: true}));
        }
      }

      reveal(li) {                                    // scroll the list, never the page
        const ol = li.parentElement;
        if (!ol.clientHeight || ol.scrollHeight <= ol.clientHeight) return;
        const top = li.offsetTop, bottom = top + li.offsetHeight;
        if (top < ol.scrollTop) ol.scrollTop = top;
        else if (bottom > ol.scrollTop + ol.clientHeight) ol.scrollTop = bottom - ol.clientHeight;
      }
    }

    if (!root.customElements.get('xd-crossword')) root.customElements.define('xd-crossword', XdCrossword);
  }

  root.XDCrossword = {parse, xdown, plain, readings, Solver};
})(typeof window !== 'undefined' ? window : globalThis);
