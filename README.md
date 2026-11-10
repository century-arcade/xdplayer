# xdplayer

A small crossword player for a web page: one JavaScript file (34 KB, 11 KB gzipped), no dependencies, no build step.
It plays [.xd](https://github.com/century-arcade/xdformat), the plain-text crossword format, and shows how to draw
nearly everything [.xd v4](https://github.com/century-arcade/xdformat/blob/master/doc/xd-format-v4.md) describes:
Schrödinger squares, circles, shading and bars, and xdown in clues.

**[Try it](https://centuryarcade.org/xdplayer/demo/)**: five public-domain puzzles from 1913 to 1930, starting with the
first crossword.

The terminal player of the same name is [devottys/xdplayer](https://github.com/devottys/xdplayer).

```html
<script src="xd-player.js"></script>
<xd-player src="puzzle.xd"></xd-player>
```

Or put the puzzle in the page, which needs no server for the puzzle:

```html
<xd-player><script type="text/xd">
Title: My Puzzle
Author: Me


CAT
ORE
WED


A1. Pet ~ CAT
A4. Mine find ~ ORE
A5. Married ~ WED

D1. Dairy animal ~ COW
D2. Exist ~ ARE
D3. Mr. Lasso ~ TED
</script></xd-player>
```

[index.html](index.html) is the smallest working page. [demo/](demo/) is a fuller one: five public-domain puzzles
from 1913 to 1930 with a picker, including Wynne's first crossword as printed. It's live at
[centuryarcade.org/xdplayer/demo](https://centuryarcade.org/xdplayer/demo/), from `main` through GitHub Pages; locally,
serve the folder (`python -m http.server`) and open /demo/. `python demo/make.py` rebuilds it from `demo/puzzles/`, and
`--inline OUT` writes it as one file with the player inside, for a host that takes a single page.

## Keys

| Key | What it does |
|---|---|
| Letter or digit | Fills the square, then moves to the next blank in the entry. If that was the last blank, on to the next entry that needs something. Typing over a full entry moves one square at a time. |
| Arrows | Along the entry: move, over black squares. Across it: turn to face that way without moving. |
| Shift+arrows | Strafe: move without turning. Across the entry, to the nearest square that way in an entry of this direction. Along it, to the start of the next entry. |
| Tab, Enter | Next entry with a blank, across then down. Shift goes back. |
| Space | Turn between across and down. |
| Backspace | Clears the square. On a blank square, goes back one and clears that. |
| Delete | Clears the square and stays. |
| Home, End | Start and end of the entry. |
| Escape | Rebus: type any number of letters or symbols, then Enter or Escape. |

Clicking a square selects it; clicking it again turns. On a phone, the bar over the grid has previous and next, and
tapping the clue turns.

## Attributes

| Attribute | |
|---|---|
| `src` | The .xd file. It's fetched, so it needs to be same-origin or allow CORS. |
| `nosave` | Don't keep progress. Otherwise it's saved in `localStorage`, per puzzle. |
| `notools` | Hide the Check, Reveal, Clear and Rebus buttons. |
| `theme="light"`, `theme="dark"` | Stay light or dark whatever the visitor's system says. It follows the system otherwise. |

The element fires `xd-solved` when the grid is right. From a script, `element.show(xdText)` loads a puzzle.

## Colors and size

Set these on the element: `--xd-ink`, `--xd-muted`, `--xd-bg`, `--xd-cell`, `--xd-block`, `--xd-line`, `--xd-word`,
`--xd-cursor`, `--xd-bad`, `--xd-good`, `--xd-shown`, `--xd-shade`, and `--xd-max-cell` (40px). Past 700px wide the clues
sit beside the grid.

## What of .xd it reads

Section headings or the older blank-line form; rebus squares, including Schrödinger squares (`Rebus: 1=O 1=A`) and the
older `a/b` and `a|b` forms; circles, shading and bars; spacers; uniclue; xdown in clues and metadata (italics, links,
images and so on); old puzzles numbered their own way, when the count of clues matches the grid; and the oldest
style, a clue numbered by the squares it starts and ends on (`2-3.`), placed by its answer and those labels, with an
entry no clue claims shown as printed filled in.

It doesn't draw `background-image` cells. An older `a/b` square accepts either reading in either direction, because the
file doesn't say which applies where.

Tab stays in the grid, as crossword solvers expect, so a keyboard user leaves it with the browser's own shortcut
(F6 in most browsers).

## Tests

```bash
node --test test/solver.test.mjs
```

The tests run without a browser: `parse` and `Solver` have no DOM in them.
