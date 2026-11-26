import { forwardRef, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { Tooltip } from '@base-ui/react/tooltip';
import { chordFor } from '../keys';
import './Button.css';

// The one button (spec 020). Its look is set by properties, never by a class:
// how much it stands out (emphasis), what it does (tone), how big it is, and
// whether it carries an icon. Before this, 356 hand-built <button>s chose a
// look from class combinations (btn, btn-sm, primary, danger) whose rules were
// stated four times over in styles.css and theme.css, and the first ui/Button
// had three corner shapes. Every value now comes from a token: the button's
// own (component.tokens.json, `button`) and spec 019's colour roles.
// Behaviour comes from Base UI: a disabled button stays out of the tab order
// and ignores clicks, with data-disabled for the look (spec 001, FR-009).

/** high: filled, the one main action of a screen. medium: an outline, the
 *  default. low: a background on hover only, for toolbars. link: text only. */
export type ButtonEmphasis = 'high' | 'medium' | 'low' | 'link';
/** neutral: most buttons. primary: the accent. destructive: deletes or removes
 *  something that cannot simply be undone. */
export type ButtonTone = 'neutral' | 'primary' | 'destructive';

type Common = Omit<ComponentPropsWithoutRef<typeof BaseButton>, 'className' | 'children'> & {
  emphasis?: ButtonEmphasis;
  tone?: ButtonTone;
  /** md: lines up with inputs. sm: toolbars, dense rows. xs: an action
   *  inside a table cell (ui/CellAction), 30px on a touch screen. */
  size?: 'xs' | 'sm' | 'md';
  /** A toggle that stays on (aria-pressed): the faint primary tint, whatever
   *  the tone (owner, spec 020 Q2). Leave it undefined for a plain button. */
  pressed?: boolean;
  /** A shortcut id from keys.ts. Its live chord is shown after the label, and
   *  disappears when the shortcut is not bound here (FR-010). */
  shortcut?: string;
  className?: string;
  /** A link that looks like a button (a sign-in page, a download, an
   *  external sign-in): rendered as a real <a>, so it is announced and opened
   *  as a link. Base UI's button would put role="button" on it. Disabled
   *  drops the href, which leaves nothing to follow. */
  href?: string;
  download?: string | boolean;
};

/** With a label: `icon` is optional and shown before it. Without one, the
 *  button is a square holding only the icon, and must still have a name:
 *  `label` is required, read by a screen reader and shown as a tooltip, and
 *  arrives already translated (spec 001, FR-008). */
export type ButtonProps = Common &
  ({ children: ReactNode; icon?: ReactNode; label?: never } | { children?: undefined; icon: ReactNode; label: string; href?: never; download?: never });

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { emphasis = 'medium', tone = 'neutral', size = 'md', pressed, shortcut, className, children, icon, label, type = 'button', disabled, href, download, ...rest },
  ref,
) {
  // Icon only when there is a name and nothing else to show: '' or 0 as
  // children is a label, however short, not a missing one.
  const iconOnly = label !== undefined && (children === undefined || children === null || children === false);
  const chord = shortcut ? chordFor(shortcut) : '';
  // Spread after the caller's props, so nothing from outside changes the look:
  // a Menu or Popover trigger clones its props onto the button, and Base UI's
  // Menu.Trigger sets data-pressed while its menu is open, which turned every
  // such button into a pressed toggle (found by review).
  const look = {
    className: 'ui-button' + (className ? ' ' + className : ''),
    'data-emphasis': emphasis,
    'data-tone': tone,
    'data-size': size,
    'data-icon-only': iconOnly ? '' : undefined,
    'data-pressed': pressed ? '' : undefined,
    'aria-pressed': pressed === undefined ? undefined : pressed,
  };
  const glyph = icon ? (
    <span aria-hidden="true" className="ui-button-icon">
      {icon}
    </span>
  ) : null;

  if (iconOnly) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger
          ref={ref}
          aria-label={label}
          {...(rest as ComponentPropsWithoutRef<'button'>)}
          {...look}
          // Tooltip.Trigger keeps `disabled` to itself (it only switches the
          // tooltip off), so the button would stay clickable: hand it to the
          // element, with the attribute the look reads (found by review).
          render={<button type={type} disabled={disabled} data-disabled={disabled ? '' : undefined} />}
        >
          {glyph}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6} className="ui-tooltip-positioner">
            <Tooltip.Popup className="ui-tooltip">{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }
  // A plain-text label gets its own box, trimmed to its capitals (text-box in
  // Button.css applies to a block, and a flex item is one). Anything else
  // (a swatch and a count, an icon among the children) stays a direct child
  // of the button: wrapping it took away the gap between its parts and broke
  // callers that style them as the button's children (a chart legend lost its
  // colour dots).
  const text = typeof children === 'string' || typeof children === 'number';
  const content = (
    <>
      {glyph}
      {text ? <span className="ui-button-label">{children}</span> : children}
      {chord && <kbd className="ui-button-kbd">{chord}</kbd>}
    </>
  );
  if (href !== undefined) {
    // Base UI's own props mean nothing on an <a>, and React warns about them.
    // A disabled link has no href and no click (found by review), and keeps
    // role="link" by hand, since an <a> without href has no role for
    // aria-disabled to qualify.
    const { render: _render, nativeButton: _native, focusableWhenDisabled: _focusable, onClick, ...anchor } = rest;
    return (
      <a
        ref={ref as unknown as Ref<HTMLAnchorElement>}
        {...(anchor as ComponentPropsWithoutRef<'a'>)}
        onClick={disabled ? undefined : (onClick as ComponentPropsWithoutRef<'a'>['onClick'])}
        href={disabled ? undefined : href}
        download={disabled ? undefined : download}
        role={disabled ? 'link' : undefined}
        aria-disabled={disabled || undefined}
        data-disabled={disabled ? '' : undefined}
        {...look}
      >
        {content}
      </a>
    );
  }
  return (
    <BaseButton ref={ref} type={type} disabled={disabled} {...rest} {...look}>
      {content}
    </BaseButton>
  );
});
