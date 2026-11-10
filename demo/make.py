"""Write demo/index.html: the puzzles in demo/puzzles, each in the page, with a picker.

    python demo/make.py                  # demo/index.html, loading ../xd-player.js
    python demo/make.py --inline OUT     # one self-contained file, the player inlined (for hosts that take one file)
"""
import html
import sys
from pathlib import Path

HERE = Path(__file__).parent

# (id, file, year, where it ran, what it shows). All published in the US before 1931, so in the public domain.
PUZZLES = [
    ("wynne-1913", "nyw1913-12-21.xd", "1913", "New York World",
     "The first crossword, by Arthur Wynne. A diamond, numbered as printed (“2-3”), with FUN filled in."),
    ("book-1924", "ssb-01.xd", "1924", "The Cross Word Puzzle Book",
     "Puzzle 1 of the first crossword book, from Simon & Schuster."),
    ("post-1924", "wap1924-10-12.xd", "1924", "The Washington Post",
     "The Post’s Cross Word Puzzle Number 1."),
    ("latimes-1924", "lat1924-11-27.xd", "1924", "Los Angeles Times",
     "A cross of black squares across a 15×15."),
    ("judge-1930", "judgenew-137.xd", "1930", "Judge",
     "A 13×13 from the humor magazine, by Mary Anne Sawyer."),
]

PAGE = """<title>xdplayer</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;800&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
  /* a narrow column: what it is, the picker, then the player as wide as the page allows */
  :root { --bg: #fbfbf8; --fg: #1b1c1f; --muted: #6a6c72; --line: #dcdcd6; --accent: #1f5fbf; --chip: #eef0ec;
    --display: "Libre Franklin", system-ui, sans-serif; --body: system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, Consolas, monospace; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #151618; --fg: #ecece6; --muted: #9a9ca3;
    --line: #34363b; --accent: #7aa7ee; --chip: #222428; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #151618; --fg: #ecece6; --muted: #9a9ca3; --line: #34363b; --accent: #7aa7ee;
    --chip: #222428; color-scheme: dark; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 var(--body); }
  main { max-width: 1040px; margin: 0 auto; padding-block: 28px 56px;
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  h1 { font: 800 30px/1.1 var(--display); letter-spacing: -.01em; margin: 0 0 6px; }
  .lede { max-width: 62ch; margin: 0 0 18px; color: var(--muted); }
  .lede a { color: var(--accent); }
  pre { margin: 0 0 24px; padding: 10px 12px; overflow-x: auto; background: var(--chip); border-radius: 6px;
    font: 13px/1.5 var(--mono); }
  .pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin: 0 0 24px;
    padding: 0; list-style: none; }
  .pick a { display: flex; flex-direction: column; gap: 2px; height: 100%; box-sizing: border-box; padding: 10px 12px;
    border: 1px solid var(--line); border-radius: 6px; color: inherit; text-decoration: none; }
  .pick a:hover { border-color: var(--muted); }
  .pick a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .pick a[aria-current="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .pick .yr { font: 600 12px/1 var(--mono); color: var(--muted); letter-spacing: .04em; }
  .pick .pub { font: 600 15px/1.25 var(--display); }
  .pick .what { font-size: 13px; color: var(--muted); }
  @media (max-width: 600px) {     /* one swipeable row, so the grid is near the top */
    .pick { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 72%; overflow-x: auto;
      scroll-snap-type: x mandatory; padding-bottom: 4px; }
    .pick li { scroll-snap-align: start; }
    pre { display: none; }
  }
  xd-player { --xd-max-cell: 42px; }
  footer { margin-top: 36px; font-size: 13px; color: var(--muted); max-width: 70ch; }
  footer a { color: inherit; }
</style>
SCRIPT
<main>
<h1>xdplayer</h1>
<p class="lede">A crossword player for any web page: one script, no dependencies. It plays
  <a href="https://github.com/century-arcade/xdformat">.xd</a>, the plain-text crossword format. Click a square or a
  clue and type. Arrows move, Shift-arrows strafe, Tab goes to the next clue, Space turns, Escape enters a rebus.</p>
<pre>&lt;script src="xd-player.js"&gt;&lt;/script&gt;
&lt;xd-player src="puzzle.xd"&gt;&lt;/xd-player&gt;</pre>
<ul class="pick">
LINKS
</ul>
<xd-player id="player" theme-follow></xd-player>
<footer>These puzzles ran between 1913 and 1930 and are in the public domain. Their text is from gxd, the .xd crossword
  corpus. Your progress on each is kept in this browser.</footer>
</main>
PUZZLES
<script>
  const player = document.getElementById('player'), ids = [...document.querySelectorAll('script[type="text/xd"]')].map(s => s.id);
  function open() {
    const id = ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : ids[0];
    player.show(document.getElementById(id).textContent);
    for (const a of document.querySelectorAll('.pick a')) a.setAttribute('aria-current', String(a.hash === '#' + id));
    const pick = document.querySelector('.pick'), li = pick.querySelector('[aria-current="true"]').parentElement;
    pick.scrollLeft = li.offsetLeft - pick.offsetLeft;   // on a phone the row scrolls sideways; never the page
  }
  function theme() {             // the page's own light/dark switch, when it has one, reaches into the player
    const t = document.documentElement.dataset.theme;
    if (t) player.setAttribute('theme', t); else player.removeAttribute('theme');
  }
  new MutationObserver(theme).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  theme();
  addEventListener('hashchange', open);
  customElements.whenDefined('xd-player').then(open);
</script>
"""


def build(script_tag):
    links = "\n".join(
        f'  <li><a href="#{pid}"><span class="yr">{yr}</span><span class="pub">{html.escape(pub)}</span>'
        f'<span class="what">{html.escape(what)}</span></a></li>' for pid, _, yr, pub, what in PUZZLES)
    blocks = "\n".join(
        f'<script type="text/xd" id="{pid}">\n{(HERE / "puzzles" / f).read_text(encoding="utf-8").replace("</", "<\\/")}</script>'
        for pid, f, *_ in PUZZLES)
    return PAGE.replace("SCRIPT", script_tag).replace("LINKS", links).replace("PUZZLES", blocks)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--inline"]:
        js = (HERE.parent / "xd-player.js").read_text(encoding="utf-8").replace("</script", r"<\/script")   # its comments show a tag
        Path(sys.argv[2]).write_text(build(f"<script>\n{js}</script>"), encoding="utf-8", newline="\n")
    else:
        page = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n" + build(
            '<script src="../xd-player.js"></script>') + "\n</html>\n"
        (HERE / "index.html").write_text(page, encoding="utf-8", newline="\n")
