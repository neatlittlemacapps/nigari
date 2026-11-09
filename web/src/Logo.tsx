import { useId } from 'react';

// nigari's mark (#322; the owner's artwork, brand/mark.svg): two pages, the
// front one overlapping the back one.
//
// Inline as JSX rather than <img src="/logo.svg"> so it is drawn with the page
// and needs no request. It keeps its own colours in both themes: the owner
// drew one mark that reads on light and dark alike. The overlap is a third
// shape, clipped to the back page, not a blend mode: a blend mixes with the
// page behind the SVG, and on a dark page it turned the front shape black.
//
// useId: the clip path is looked up by id across the whole document, and the
// mark can be on screen twice (the empty state under the loading screen).
// Two copies with one id would both clip to whichever came first.
const MARK_BACK =
  'M16 200.594C16 169.187 41.5178 146.346 72.7458 149.736L251.549 169.544C302.584 174.897 344.341 220.936 344.341 271.972V359.411C344.341 373.151 331.314 388.14 320.25 391.352L48.6556 468.976C30.6326 474.151 16 462.909 16 444.351V200.594Z';
const MARK_FRONT =
  'M130.177 106.035C130.177 66.7773 162.119 38.0479 201.2 42.1521L389.465 61.7809C447.997 68.0264 496 121.202 496 180.089V359.424C496 386.904 473.872 405.106 446.926 399.752C404.99 391.544 370.5 377 346 384C309.812 394.339 304.5 395.981 164.439 435.619C145.523 440.973 130.177 429.374 130.177 409.745V106.035Z';

// The artwork's own colours, not theme tokens: the mark looks the same in
// both themes, and check-brand.mjs holds them to brand/mark.svg.
const BACK = '#A98AFB'; // token-ok: brand artwork, brand/mark.svg
const FRONT = '#6542E8'; // token-ok: brand artwork, brand/mark.svg
const OVERLAP = '#391FA2'; // token-ok: brand artwork, brand/mark.svg

// `decorative`: the mark beside the visible word "nigari" (the sign-in and
// setup wordmark) is hidden from screen readers, or they announce the name
// twice, "nigari, image" and then the heading "nigari" (#322 audit). Alone,
// or beside other words (an instance's own name, "Join the workspace"), it
// keeps its name: there it is the only thing that says which product this is.
export default function Logo({
  size = 32,
  className,
  decorative = false,
}: {
  size?: number;
  className?: string;
  decorative?: boolean;
}) {
  const clip = `nigari-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'nigari' })}
    >
      <defs>
        <clipPath id={clip}>
          <path d={MARK_BACK} />
        </clipPath>
      </defs>
      <path d={MARK_BACK} fill={BACK} />
      <path d={MARK_FRONT} fill={FRONT} />
      <path d={MARK_FRONT} fill={OVERLAP} clipPath={`url(#${clip})`} />
    </svg>
  );
}
