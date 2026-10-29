// "Save chart as" (spec 004, FR-026, research R17): the chart as a PNG, with
// its title, its legend and its caption drawn in, on the page's surface or one
// of four soft chart backgrounds. The app's first file made in the browser:
// the picture is a drawing of numbers an agent already reads through
// query_rows, so no route makes it (the parity manifest says so).
//
// The canvas Chart.js draws is only the plot; the title, the legend, a
// donut's total and the caption are page text around it (so a screen reader
// reads them). A picture of the canvas alone would lose all of that, so this
// module draws them again around a 2× copy of the plot.

export type PictureBackground = 'surface' | '1' | '2' | '3' | '4';

/** The CSS custom property each background reads. */
export const BACKGROUND_TOKEN: Record<PictureBackground, string> = {
  surface: '--color-surface-default',
  '1': '--color-chart-background-1',
  '2': '--color-chart-background-2',
  '3': '--color-chart-background-3',
  '4': '--color-chart-background-4',
};

/** What the chart hands over to be drawn: the plot at 2× (absent for a
 *  number chart), the words around it, and the ink it was drawn in. */
export interface PictureParts {
  plot: HTMLCanvasElement | null;
  /** The plot's size on the page, in CSS pixels. */
  width: number;
  height: number;
  title: string;
  legend: { label: string; value: string; colour: string }[];
  /** A donut's total, drawn over its hole as on the page. */
  centre?: { value: string; label: string };
  /** A number chart's one value, drawn large where the plot would be. */
  number?: string;
  caption?: string;
  ink: { text: string; muted: string; font: string; fontSize: number };
  /** Reads a token where the chart is shown, so a chart in a dark peek over
   *  a light page is saved in the colours it is seen in. */
  token: (name: string) => string;
}

const SCALE = 2;
const PAD = 24;
const GAP = 12;

/** Draws the picture: title, plot (or the number), legend, caption. */
export function composePicture(parts: PictureParts, background: string): HTMLCanvasElement {
  const width = Math.max(parts.width, 320) + 2 * PAD;
  const fs = parts.ink.fontSize;
  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  measure.font = `${fs}px ${parts.ink.font}`;

  // Legend rows, wrapped to the width: swatch, label, value.
  const rows: { x: number; item: PictureParts['legend'][number] }[][] = [[]];
  let x = 0;
  for (const item of parts.legend) {
    const w = fs + 6 + measure.measureText(`${item.label}  ${item.value}`).width + 18;
    if (x + w > width - 2 * PAD && rows[rows.length - 1].length) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push({ x, item });
    x += w;
  }
  const legendH = parts.legend.length ? rows.length * (fs + 8) : 0;
  const plotH = parts.plot ? parts.height : fs * 4;
  const captionH = parts.caption ? fs + 8 : 0;
  const height = PAD + fs * 1.4 + GAP + plotH + (legendH ? GAP + legendH : 0) + (captionH ? GAP + captionH : 0) + PAD;

  const out = document.createElement('canvas');
  out.width = Math.round(width * SCALE);
  out.height = Math.round(height * SCALE);
  const ctx = out.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'top';

  let y = PAD;
  ctx.fillStyle = parts.ink.text;
  ctx.font = `600 ${Math.round(fs * 1.15)}px ${parts.ink.font}`;
  ctx.fillText(parts.title, PAD, y);
  y += fs * 1.4 + GAP;

  if (parts.plot) {
    ctx.drawImage(parts.plot, PAD, y, parts.width, parts.height);
    if (parts.centre) {
      const cx = PAD + parts.width / 2;
      const cy = y + parts.height / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fs * 2.4}px ${parts.ink.font}`;
      ctx.fillText(parts.centre.value, cx, cy - fs * 0.6);
      ctx.fillStyle = parts.ink.muted;
      ctx.font = `${fs}px ${parts.ink.font}`;
      ctx.fillText(parts.centre.label, cx, cy + fs * 0.9);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    }
  } else if (parts.number !== undefined) {
    ctx.font = `700 ${fs * 3}px ${parts.ink.font}`;
    ctx.fillText(parts.number, PAD, y);
  }
  y += plotH;

  if (legendH) {
    y += GAP;
    ctx.font = `${fs}px ${parts.ink.font}`;
    for (const row of rows) {
      for (const { x: rx, item } of row) {
        ctx.fillStyle = item.colour;
        ctx.fillRect(PAD + rx, y + 2, fs - 4, fs - 4);
        ctx.fillStyle = parts.ink.text;
        ctx.fillText(item.label, PAD + rx + fs + 2, y);
        ctx.fillStyle = parts.ink.muted;
        ctx.fillText(item.value, PAD + rx + fs + 2 + measure.measureText(item.label + '  ').width, y);
      }
      y += fs + 8;
    }
  }
  if (captionH) {
    y += GAP;
    ctx.fillStyle = parts.ink.muted;
    ctx.font = `${fs}px ${parts.ink.font}`;
    ctx.fillText(parts.caption as string, PAD, y);
  }
  return out;
}

export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), 'image/png'));
}

/** Copies the picture. Throws where the browser refuses (no clipboard
 *  permission, an insecure origin, a browser without image copying); the
 *  caller then downloads it instead. */
export async function copyPng(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('no clipboard');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function downloadPng(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked after the click has been handled: revoking at once can cancel
  // the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from the chart's name: what a file system takes everywhere. */
export function fileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return (base || 'chart') + '.png'; // i18n-ok: a fallback file name, not shown as text
}
