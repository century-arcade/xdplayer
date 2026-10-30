// node --test. No DOM: the parser and the Solver, which hold everything a keypress means.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../xd-crossword.js';

const {parse, xdown, plain, readings, Solver} = globalThis.XDCrossword;

// open squares and black ones in a shape the keyboard rules care about:
//   A B C # D E
//   F # G H I J
//   K L M # N O
const GRID = `Title: T


ABC#DE
F#GHIJ
KLM#NO


A1. one ~ ABC
A3. two ~ DE
A5. three ~ GHIJ
A6. four ~ KLM
A7. five ~ NO

D1. six ~ AFK
D2. seven ~ CGM
D3. eight ~ DIN
D4. nine ~ EJO
`;

const at = s => [s.pos.r, s.pos.c, s.dir];
const put = (s, r, c, d = 'A') => s.go(s.at(r, c), d);
const keys = (s, ...ks) => ks.forEach(k => s.key(k));
const row = (s, r) => s.cells.filter(k => k.r === r).map(k => k.val || '.').join('');

test('parse: implicit sections, in order', () => {
  const p = parse(GRID);
  assert.equal(p.meta.title, 'T');
  assert.equal(p.rows.length, 3);
  assert.equal(p.clues.length, 9);
  assert.deepEqual(p.clues[0], {dir: 'A', ref: '1', body: 'one', answers: ['ABC']});
});

test('parse: headings, any case and order, and CRLF', () => {
  const p = parse('## clues\r\n\r\nA1. x ~ AB\r\n\r\n## GRID\r\n\r\nAB\r\n##\r\n\r\n## Metadata\r\n\r\nTITLE: Hi\r\n');
  assert.equal(p.meta.title, 'Hi');
  assert.deepEqual(p.rows, [['A', 'B'], ['#', '#']]);
  assert.equal(p.clues.length, 1);
});

test('parse: an unnamed section is ignored, and a grid line of ## is not a heading', () => {
  const p = parse('## Notes\n\nA1. not a clue ~ NO\n\n## Grid\n\n##AB\nAB##\n\n## Clues\n\nA1. x ~ AB\n');
  assert.equal(p.rows[0].join(''), '##AB');
  assert.equal(p.clues.length, 1);
});

test('parse: clue line details', () => {
  const p = parse('## Grid\n\nAB\n\n## Clues\n\nA1. Mr. Big ~ AB (2 letters)\nA1 ^Refs: A2\nA2. Sugar ___ ~ CONE ~ CANE\n3. Uniclue ~ X\n');
  assert.deepEqual(p.clues[0], {dir: 'A', ref: '1', body: 'Mr. Big', answers: ['AB']});
  assert.deepEqual(p.clues[1].answers, ['CONE', 'CANE']);
  assert.equal(p.clues[2].dir, '');
  assert.equal(p.clues.length, 3);
});

test('readings: plain, Schrödinger, older forms, literals', () => {
  assert.deepEqual(readings(['HEART']), ['HEART']);
  assert.deepEqual(readings(['O', 'A']), ['O', 'A']);
  assert.deepEqual(readings(['/']), ['/']);
  assert.deepEqual(readings(['']), ['']);
  assert.ok(readings(['IE/EI']).includes('EI') && readings(['IE/EI']).includes('IE'));
  assert.ok(['T', 'W', 'TW'].every(x => readings(['T/W']).includes(x)));
  assert.ok(['SE', 'S', 'E'].every(x => readings(['SE/S|E']).includes(x)));
});

test('numbers and entries', () => {
  const s = new Solver(GRID);
  assert.deepEqual(s.words.A.map(w => [w.num, w.sq.length, w.clue]),
    [['1', 3, 'one'], ['3', 2, 'two'], ['5', 4, 'three'], ['6', 3, 'four'], ['7', 2, 'five']]);
  assert.deepEqual(s.words.D.map(w => [w.num, w.sq.length]), [['1', 3], ['2', 3], ['3', 3], ['4', 3]]);
});

test('numbered another way: clues go in order, with the printed numbers', () => {
  const s = new Solver('## Grid\n\nAB\n##\nCD\n\n## Clues\n\nA2-3. top ~ AB\nA4-5. bottom ~ CD\n');
  assert.deepEqual(s.words.A.map(w => [w.label, w.clue]), [['2-3', 'top'], ['4-5', 'bottom']]);
  assert.equal(s.at(0, 0).num, '2');
});

test('spacers and short rows are not squares', () => {
  const s = new Solver('## Grid\n\n_AB\nCD\n\n## Clues\n');
  assert.equal(s.W, 3);
  assert.ok(s.at(0, 0).void && s.at(1, 2).void);
  assert.equal(s.at(0, 0).A, null);
});

test('bars end an entry', () => {
  const s = new Solver('## Grid\n\nABCD\n\n## Clues\n\n## Design\n\nB { bar-left: true }\n\n..B.\n');
  assert.deepEqual(s.words.A.map(w => w.sq.length), [2, 2]);
});

test('circles and shading: v4 design, and v3 lowercase with Special', () => {
  const s = new Solver('## Grid\n\nAB\n\n## Clues\n\n## Design\n\nO { background: circle }\nS { background: shaded }\n\nOS\n');
  assert.ok(s.at(0, 0).circle && s.at(0, 1).shaded);
  const v3 = new Solver('Special: circle\n\n\naB\n\n\nA1. x ~ AB\n');
  assert.ok(v3.at(0, 0).circle);
  keysAll(v3, 'AB');
  assert.ok(v3.solved);
});
function keysAll(s, word) { for (const ch of word) s.key(ch); }

test('typing advances along the entry', () => {
  const s = new Solver(GRID);
  s.key('a');
  assert.deepEqual(at(s), [0, 1, 'A']);
  assert.equal(s.at(0, 0).val, 'A');
});

test('typing skips squares already filled, in the entry', () => {
  const s = new Solver(GRID);
  put(s, 1, 2);                                       // 5-Across, GHIJ
  keys(s, 'x');
  put(s, 1, 3); keys(s, 'y');                         // filled G and H; I, J blank
  put(s, 1, 2); keys(s, 'z');                         // retype G: on to I, past H
  assert.deepEqual(at(s), [1, 4, 'A']);
});

test('at the end of an entry with blanks left, typing goes back to the first blank', () => {
  const s = new Solver(GRID);
  put(s, 0, 2); s.key('c');
  assert.deepEqual(at(s), [0, 0, 'A']);
});

test('finishing an entry goes to the next entry with a blank', () => {
  const s = new Solver(GRID);
  keys(s, 'a', 'b', 'c');
  assert.deepEqual(at(s), [0, 4, 'A']);
});

test('typing over a full entry only moves one square, and stops at its end', () => {
  const s = new Solver(GRID);
  keys(s, 'a', 'b', 'c');
  put(s, 0, 0); s.key('x');
  assert.deepEqual(at(s), [0, 1, 'A']);
  put(s, 0, 2); s.key('y');
  assert.deepEqual(at(s), [0, 2, 'A']);
});

test('backspace clears a letter and stays; on a blank it goes back and clears that', () => {
  const s = new Solver(GRID);
  keys(s, 'a', 'b');                                  // at C, blank
  s.key('Backspace');
  assert.deepEqual(at(s), [0, 1, 'A']);
  assert.equal(row(s, 0).slice(0, 3), 'A..');
  s.key('Backspace');
  assert.deepEqual(at(s), [0, 0, 'A']);
  assert.equal(row(s, 0).slice(0, 3), '...');
  s.key('Backspace');                                 // the start of the entry: stays
  assert.deepEqual(at(s), [0, 0, 'A']);
});

test('backspace on a filled square stays put', () => {
  const s = new Solver(GRID);
  keys(s, 'a', 'b');
  put(s, 0, 1); s.key('Backspace');
  assert.deepEqual(at(s), [0, 1, 'A']);
  assert.equal(row(s, 0).slice(0, 3), 'A..');
});

test('delete clears and stays', () => {
  const s = new Solver(GRID);
  s.key('a'); put(s, 0, 0); s.key('Delete');
  assert.deepEqual(at(s), [0, 0, 'A']);
  assert.equal(s.at(0, 0).val, '');
});

test('an arrow across the entry turns and stays; the next one moves', () => {
  const s = new Solver(GRID);
  s.key('ArrowDown');
  assert.deepEqual(at(s), [0, 0, 'D']);
  s.key('ArrowDown');
  assert.deepEqual(at(s), [1, 0, 'D']);
});

test('arrows along the entry move over black squares, and stop at the edge', () => {
  const s = new Solver(GRID);
  put(s, 0, 2); s.key('ArrowRight');
  assert.deepEqual(at(s), [0, 4, 'A']);
  put(s, 0, 5); s.key('ArrowRight');
  assert.deepEqual(at(s), [0, 5, 'A']);
});

test('an arrow to a square with no entry that way takes the direction it has', () => {
  // F, between A and K, has no across entry
  const s = new Solver(GRID);
  put(s, 0, 0, 'D'); s.key('ArrowDown');
  assert.deepEqual(at(s), [1, 0, 'D']);
  s.key('ArrowRight');                                // no across here: moves, over the black square
  assert.deepEqual(at(s), [1, 2, 'A']);
});

test('shift-arrow across the entry strafes: moves, keeps the direction', () => {
  const s = new Solver(GRID);
  put(s, 0, 2);                                       // C, across
  s.key('ArrowDown', true);
  assert.deepEqual(at(s), [1, 2, 'A']);               // G, still across, same column
  s.key('ArrowUp', true);
  assert.deepEqual(at(s), [0, 2, 'A']);
});

test('shift-arrow strafe passes squares with no entry in this direction', () => {
  const s = new Solver(GRID);
  put(s, 0, 0);                                       // A; below it F has no across, then K does
  s.key('ArrowDown', true);
  assert.deepEqual(at(s), [2, 0, 'A']);
});

test('shift-arrow along the entry goes to the next entry that way, at its start', () => {
  const s = new Solver(GRID);
  put(s, 0, 1);                                       // B in 1-Across
  s.key('ArrowRight', true);
  assert.deepEqual(at(s), [0, 4, 'A']);
  s.key('ArrowLeft', true);
  assert.deepEqual(at(s), [0, 0, 'A']);
  s.key('ArrowLeft', true);                           // nothing further: stays
  assert.deepEqual(at(s), [0, 0, 'A']);
});

test('shift-arrow down an entry, for down', () => {
  const s = new Solver('## Grid\n\nAB\nCD\n##\nEF\nGH\n\n## Clues\n');
  put(s, 0, 0, 'D');
  s.key('ArrowDown', true);
  assert.deepEqual(at(s), [3, 0, 'D']);
  s.key('ArrowRight', true);                          // sideways: strafe
  assert.deepEqual(at(s), [3, 1, 'D']);
});

test('space turns, and stays', () => {
  const s = new Solver(GRID);
  s.key(' ');
  assert.deepEqual(at(s), [0, 0, 'D']);
});

test('tab and enter: the next entry with a blank, on from across to down; shift goes back', () => {
  const s = new Solver(GRID);
  s.key('Tab');
  assert.deepEqual(at(s), [0, 4, 'A']);
  s.key('Enter');
  assert.deepEqual(at(s), [1, 2, 'A']);
  s.key('Tab', true);
  assert.deepEqual(at(s), [0, 4, 'A']);
  for (let i = 0; i < 4; i++) s.key('Tab');
  assert.equal(s.word.num, '1');
  assert.equal(s.dir, 'D');
});

test('tab skips full entries and lands on the first blank', () => {
  const s = new Solver(GRID);
  put(s, 0, 4); keys(s, 'd', 'e');                    // 3-Across full; goes on to 5-Across
  put(s, 0, 0); s.key('Tab');
  assert.deepEqual(at(s), [1, 2, 'A']);
  put(s, 1, 2); keys(s, 'g');
  put(s, 0, 0); s.key('Tab');
  assert.deepEqual(at(s), [1, 3, 'A']);
});

test('home and end: the ends of the entry', () => {
  const s = new Solver(GRID);
  put(s, 1, 3); s.key('End');
  assert.deepEqual(at(s), [1, 5, 'A']);
  s.key('Home');
  assert.deepEqual(at(s), [1, 2, 'A']);
});

test('clicking: a square selects, the same square turns, a clue goes to its first blank', () => {
  const s = new Solver(GRID);
  s.click(s.at(0, 2));
  assert.deepEqual(at(s), [0, 2, 'A']);
  s.click(s.at(0, 2));
  assert.deepEqual(at(s), [0, 2, 'D']);
  s.key('a');
  s.click(s.at(0, 2));                                // back, turned
  s.clickWord(s.words.D[1]);
  assert.deepEqual(at(s), [1, 2, 'D']);
});

test('a key not for us is left alone', () => {
  const s = new Solver(GRID);
  assert.equal(s.key('F5'), false);
  assert.equal(s.key('!'), false);
  assert.equal(s.key('a'), true);
});

const REBUS = `Rebus: 1=HEART 2=O 2=A 3=/ 4=


1AT
#2#
#3#
#4#


A1. x ~ HEARTAT
`;

test('rebus: escape, letters, enter; the square holds them all', () => {
  const s = new Solver(REBUS);
  s.key('Escape');
  keys(s, 'h', 'e', 'a', 'r', 't', 'x', 'Backspace');
  assert.equal(s.rebus, 'HEART');
  s.key('Enter');
  assert.equal(s.rebus, null);
  assert.equal(s.at(0, 0).val, 'HEART');
  assert.ok(s.right(s.at(0, 0)));
  assert.deepEqual(at(s), [0, 1, 'A']);
});

test('rebus: escape ends it too, and symbols go in', () => {
  const s = new Solver(REBUS);
  put(s, 2, 1, 'D');
  s.key('Escape'); s.key('/'); s.key('Escape');
  assert.ok(s.right(s.at(2, 1)));
});

test('rebus: an empty one changes nothing', () => {
  const s = new Solver(REBUS);
  s.key('Escape'); s.key('Enter');
  assert.deepEqual(at(s), [0, 0, 'A']);
  assert.equal(s.at(0, 0).val, '');
});

test('a Schrödinger square takes any of its readings; a square left blank on purpose needs nothing', () => {
  const s = new Solver(REBUS);
  s.at(0, 0).val = 'HEART'; s.at(0, 1).val = 'A';
  put(s, 0, 2); s.key('t');
  put(s, 1, 1, 'D'); s.key('A');                      // O or A
  s.key('Escape'); s.key('/'); s.key('Enter');
  assert.ok(s.solved);
});

test('solved, wrong, check, reveal, clear', () => {
  const s = new Solver('## Grid\n\nAB\n\n## Clues\n\nA1. x ~ AB\n');
  keys(s, 'a', 'x');
  assert.ok(s.wrong && !s.solved);
  s.check();
  assert.equal(s.at(0, 1).mark, 'bad');
  assert.equal(s.at(0, 0).mark, '');
  s.reveal([s.at(0, 1)]);
  assert.equal(s.at(0, 1).val, 'B');
  assert.equal(s.at(0, 1).mark, 'shown');
  assert.ok(s.solved);
  s.key('x');                                         // solved: letters no longer land
  assert.equal(s.at(0, 1).val, 'B');
  s.clear();
  assert.ok(!s.solved && s.at(0, 1).val === '' && s.at(0, 1).mark === '');
});

test('saved state round trips', () => {
  const s = new Solver(GRID);
  keys(s, 'a', 'x');
  s.check();
  const t = new Solver(GRID);
  t.state = JSON.parse(JSON.stringify(s.state));
  assert.equal(row(t, 0), row(s, 0));
  assert.equal(t.at(0, 0).mark, '');
  assert.equal(t.at(0, 1).mark, 'bad');
});

test('xdown: spans, nesting, literals, links', () => {
  assert.deepEqual(xdown('plain'), ['plain']);
  assert.deepEqual(xdown('a {/b/} c'), ['a ', {t: '/', kids: ['b']}, ' c']);
  assert.deepEqual(xdown('{/{*x*}/}'), [{t: '/', kids: [{t: '*', kids: ['x']}]}]);
  assert.equal(plain(xdown('What {\\~\\} means')), 'What ~ means');
  assert.equal(plain(xdown('Empty set {\\{}\\}')), 'Empty set {}');
  assert.deepEqual(xdown('a{\\\\}b'), ['a', {t: 'br'}, 'b']);
  assert.deepEqual(xdown('{@the notes | href: https://example.com@}'),
    [{t: '@', kids: ['the notes'], attrs: {href: 'https://example.com'}}]);
  assert.equal(xdown("{!A whale | src: 'data:image/png;base64,iVBOR'; display: block!}")[0].attrs.src, 'data:image/png;base64,iVBOR');
  assert.deepEqual(xdown('{ not markup, {a} either'), ['{ not markup, {a} either']);
  assert.deepEqual(xdown('{/ never closed'), ['{/ never closed']);
});

test('the example puzzle: every entry has its clue, and its answers match the grid', () => {
  const text = readFileSync(new URL('../example.xd', import.meta.url), 'utf8');
  const s = new Solver(text);
  assert.ok(s.all.every(w => w.clue));
  for (const c of s.puzzle.clues) {
    const w = s.words[c.dir].find(x => x.num === c.ref);
    assert.equal(w.sq.map(k => k.accept[0]).join(''), c.answers[0]);
  }
  for (const k of s.squares()) k.val = k.accept[0];
  s.finish();
  assert.ok(s.solved);
});
