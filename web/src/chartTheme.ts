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
 *  their own, and should not look like one. */
export function groupColourTokens(drawn: DrawnGroup[], palette: Palette, groupProp?: PropDef): string[] {
  const options = new Map((groupProp?.options ?? []).map((o) => [o.id, o.color]));
  let i = 0;
  return drawn.map((g) => {
    if (g.key === NO_VALUE) return '--color-chart-gray-2';
    if (g.key === OTHER) return '--color-chart-gray-3';
    const n = i++;
    if (palette === 'auto' || palette === 'colorful') {
      const fromOption = palette === 'auto' ? OPTION_TOKEN[(options.get(g.key) ?? '').toLowerCase()] : undefined;
      return fromOption ?? `--color-chart-${(n % 12) + 1}`;
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
