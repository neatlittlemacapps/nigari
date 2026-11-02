// Chart colours, type and lines, read from the design tokens at draw time
// (spec 004, research R8 and R16). Chart.js draws on a canvas, which cannot
// read CSS custom properties itself; so the values are read off the chart's
// element with getComputedStyle and handed over, and read again when the theme
// changes. No colour is written twice: the tokens are the only place a chart
// colour lives, and every one of them passes 3:1 on the surfaces
// (build-tokens.mjs checks it).

import { OPTION_HEXES } from './selectOptions';
import { NO_VALUE, OTHER, type DrawnGroup } from './chartLayout';
import type { ChartStyle, PropDef } from './types';
import type { Chart, Plugin } from 'chart.js';

export type Palette = NonNullable<ChartStyle['palette']>;

const HUES = ['gray', 'blue', 'yellow', 'green', 'purple', 'teal', 'orange', 'pink', 'red'] as const;

// A select option stores one of the option palette's hexes (selectOptions.ts).
// Its chart colour is the chart token of the same name: the option's own hex
// is tuned for a chip's background, not for a bar on the page, and several of
// them fall short of 3:1 there. Brown has no single-colour palette of its own
// and takes the colourful palette's brown.
const OPTION_TOKEN: Record<string, string> = {
  [OPTION_HEXES[0]]: '--color-chart-gray-3',
  [OPTION_HEXES[1]]: '--color-chart-11',
  [OPTION_HEXES[2]]: '--color-chart-orange-3',
  [OPTION_HEXES[3]]: '--color-chart-yellow-3',
  [OPTION_HEXES[4]]: '--color-chart-green-3',
  [OPTION_HEXES[5]]: '--color-chart-blue-3',
  [OPTION_HEXES[6]]: '--color-chart-purple-3',
  [OPTION_HEXES[7]]: '--color-chart-pink-3',
  [OPTION_HEXES[8]]: '--color-chart-red-3',
};

/** The token each drawn group is painted with, in drawing order. "No value"
 *  and "Other" are greys whatever the palette: they are not a category of
 *  their own, and should not look like one. A series of rows (Each row) is
 *  painted the palette's first colour: its bars are one series, not
 *  categories, and fifty bars cycling through twelve colours would suggest
 *  groups that are not there (research R18). Except when the palette is
 *  Colourful: that is somebody asking for colours, and it used to change
 *  nothing at all on these charts (#318).
 *
 *  On Automatic, an option in one of the option palette's colours takes the
 *  chart colour of that name, and any other group takes the colourful
 *  palette's colour for its place. Those two sets overlap by design: the
 *  colourful palette's group 3 is the green that a green option takes. So
 *  the option Done (green) and the option Third (an imported #123456, third
 *  in line) were drawn in the same green side by side (#278). A group in
 *  its place's colour now moves on to the next colour that no option in this
 *  chart, and no group before it, already shows. `colourOf` says what a
 *  token draws as, so "the same colour" means the same on the screen, not
 *  the same token name; without it, names are compared. */
export function groupColourTokens(
  drawn: DrawnGroup[],
  palette: Palette,
  groupProp?: PropDef,
  series = false,
  colourOf: (token: string) => string = (token) => token,
): string[] {
  const oneColour = series && palette !== 'colorful';
  const options = new Map((groupProp?.options ?? []).map((o) => [o.id, o.color]));
  const optionToken = (g: DrawnGroup) =>
    palette === 'auto' ? OPTION_TOKEN[(options.get(g.key) ?? '').toLowerCase()] : undefined;
  // What the option-coloured groups of this chart show: the place colours
  // stay off these.
  const taken = new Set(drawn.map(optionToken).filter((t): t is string => !!t).map(colourOf));
  const used = new Set<string>();
  let i = 0;
  return drawn.map((g) => {
    if (g.key === NO_VALUE) return '--color-chart-gray-2';
    if (g.key === OTHER) return '--color-chart-gray-3';
    const n = oneColour ? 0 : i++;
    if (palette === 'auto' || palette === 'colorful') {
      const fromOption = optionToken(g);
      if (fromOption) return fromOption;
      if (oneColour) return '--color-chart-1';
      // Twelve tries at most: with every colour taken, the place colour stands.
      for (let k = 0; k < 12; k++) {
        const token = `--color-chart-${((n + k) % 12) + 1}`;
        const c = colourOf(token);
        if (!taken.has(c) && !used.has(c)) {
          used.add(c);
          return token;
        }
      }
      return `--color-chart-${(n % 12) + 1}`;
    }
    const hue = palette === 'colorless' ? 'gray' : (HUES as readonly string[]).includes(palette) ? palette : 'blue';
    // Darkest first, so the largest groups of a sorted chart stand out most.
    return `--color-chart-${hue}-${(n % 3) + 1}`;
  });
}

export interface ChartInk {
  colours: string[];
  text: string;
  muted: string;
  grid: string;
  surface: string;
  font: string;
  fontSize: number;
  reducedMotion: boolean;
}

/** Reads what the canvas needs from the element the chart sits in, so a chart
 *  inside a dark peek over a light page still takes the colours it is shown
 *  in. */
export function readInk(el: Element, tokens: string[]): ChartInk {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const px = parseFloat(v('--font-size-sm')) || parseFloat(cs.fontSize) || 13;
  return {
    colours: tokens.map(v),
    text: v('--color-text-default'),
    muted: v('--color-text-muted'),
    grid: v('--color-border-default'),
    surface: v('--color-surface-default'),
    font: v('--font-family-sans') || cs.fontFamily,
    fontSize: px,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/** Calls back whenever the theme may have changed: the app's own light/dark
 *  switch (data-theme on <html>) and the system's, when the app follows it. */
export function onThemeChange(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  mq?.addEventListener('change', cb);
  return () => {
    mo.disconnect();
    mq?.removeEventListener('change', cb);
  };
}

/** Value labels (FR-024, research R16): each bar, slice or point's value
 *  drawn beside it, in the chart's own type and ink. Chart.js' label plugin is
 *  not shipped for this; drawing a number per element is a dozen lines. A halo
 *  in the surface colour keeps the number readable where it falls on a slice
 *  or a gridline, whatever the palette. */
export function valueLabels(ink: ChartInk, kind: 'bar' | 'hbar' | 'line' | 'donut', format: (v: number) => string): Plugin {
  return {
    id: 'nigariValueLabels',
    afterDatasetsDraw(chart: Chart) {
      const meta = chart.getDatasetMeta(0);
      const data = chart.data.datasets[0]?.data as (number | null)[] | undefined;
      if (!data) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = `600 ${ink.fontSize}px ${ink.font}`;
      ctx.fillStyle = ink.text;
      ctx.strokeStyle = ink.surface;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      const gap = 4;
      meta.data.forEach((el, i) => {
        const v = data[i];
        if (v === null || v === undefined) return;
        const text = format(v);
        let x: number;
        let y: number;
        if (kind === 'donut') {
          const at = el.tooltipPosition(true);
          x = at.x ?? 0;
          y = at.y ?? 0;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
        } else if (kind === 'hbar') {
          x = el.x + gap;
          y = el.y;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
        } else {
          x = el.x;
          y = el.y - gap - (kind === 'line' ? gap : 0);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
        }
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      });
      ctx.restore();
    },
  };
}
