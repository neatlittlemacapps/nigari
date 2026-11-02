import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Check, ChevronRight } from 'lucide-react';
import { MenuIcon, type MenuFunction } from '../menuIcons';
import { SHEET_MAX_WIDTH } from '../anchoredMenu';
import './Menu.css';

// Every menu in the app (spec 010). Base UI's Menu gives what the hand-built
// menus lacked: ↑/↓ and Home/End move, typing jumps to an item, → and ←
// open and close a submenu, Escape and a click outside close it, and focus
// goes back to the button that opened it. Its Positioner draws the popup in a
// portal, on screen, which is the job AnchoredMenu and menuStyleFor did by
// hand (#21: a row menu cut off by the sidebar's scroll).
//
// An item names its FUNCTION, not an icon: MenuItem takes the icon from
// web/src/menuIcons.ts, so one function looks the same in every menu and two
// functions never share a picture. check-menu-icons.mjs refuses a menu built
// any other way.

/** A point on the screen: where a right-click happened. */
export type MenuPoint = { x: number; y: number };

function pointAnchor(p: MenuPoint) {
  return {
    getBoundingClientRect: () => ({ x: p.x, y: p.y, left: p.x, top: p.y, right: p.x, bottom: p.y, width: 0, height: 0, toJSON: () => ({}) }),
  };
}

/** True at or below the phone width where toolbar menus become bottom sheets. */
function useNarrow(enabled: boolean): boolean {
  const query = `(max-width: ${SHEET_MAX_WIDTH}px)`;
  const [narrow, setNarrow] = useState(() => enabled && typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [enabled, query]);
  return enabled && narrow;
}

// A dialog an item opens waits until the menu has finished closing: until then
// the item still has focus (the popup animates out), modal.ts would remember
// it as the element to return to, and focus would land on nothing when the
// dialog closed (dialog-escape.mjs caught it). After the close, Base UI has
// put focus back on the trigger, which is what the dialog then returns to.
const AfterClose = createContext<((run: () => void) => void) | null>(null);

/** True at or below phone width (SHEET_MAX_WIDTH, the same breakpoint as the
 *  top bar's narrow-only rule). For items that exist only on a phone: they are
 *  left out above it rather than hidden with CSS, because a hidden item would
 *  still be a stop for the menu's arrow keys. */
export function useNarrowScreen(): boolean {
  return useNarrow(true);
}

export type MenuProps = {
  /** The button that opens the menu, rendered as the trigger. Omit it for a
   *  menu that only opens on a right-click (then pass open and anchorPoint). */
  trigger?: ReactElement;
  /** The popup's accessible name, already translated. */
  label: string;
  children: ReactNode;
  /** Controlled use: omit both to let the trigger open and close it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Opens the menu at this point instead of under the trigger (a
   *  right-click). The sidebar's ⋯ and its right-click open the SAME menu
   *  this way, so there is one list of items and one open state (R13). */
  anchorPoint?: MenuPoint | null;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /** "sheet": at phone width, a full-width sheet along the bottom edge, where
   *  the thumb reaches it and no scrolling toolbar can clip it (the rule in
   *  anchoredMenu.ts, which stays the one place that says how narrow). */
  narrow?: 'sheet';
  /** Where focus goes when the menu closes, when not to the trigger. A menu
   *  opened by a right-click or Shift+F10 on a row gives focus back to the row:
   *  its ⋯ shows only on hover, and a hidden button cannot take focus. */
  returnFocus?: RefObject<HTMLElement | null>;
  className?: string;
};

export function Menu({ trigger, label, children, open, onOpenChange, anchorPoint, side = 'bottom', align = 'end', narrow, returnFocus, className }: MenuProps) {
  const sheet = useNarrow(narrow === 'sheet');
  // One virtual anchor per point: a new object on every render would make
  // Base UI re-register its reference and restart positioning each time the
  // parent re-renders while the menu is open.
  const px = anchorPoint?.x;
  const py = anchorPoint?.y;
  const anchor = useMemo(() => (px === undefined || py === undefined ? undefined : pointAnchor({ x: px, y: py })), [px, py]);
  const pending = useRef<(() => void) | null>(null);
  const afterClose = (run: () => void) => {
    pending.current = run;
  };
  return (
    <AfterClose.Provider value={afterClose}>
    <BaseMenu.Root
      open={open}
      onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}
      onOpenChangeComplete={(o) => {
        if (o || !pending.current) return;
        const run = pending.current;
        pending.current = null;
        // A menu opened by a right-click had no trigger to return to, and a
        // pointer close does not always move focus: put it where the menu was
        // opened from before the dialog opens, so the dialog gives it back there.
        returnFocus?.current?.focus();
        run();
      }}
    >
      {trigger && <BaseMenu.Trigger render={trigger} />}
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className="ui-menu-positioner"
          side={anchorPoint ? 'bottom' : side}
          align={anchorPoint ? 'start' : align}
          sideOffset={anchorPoint ? 0 : 4}
          collisionPadding={8}
          anchor={anchor}
          data-sheet={sheet ? '' : undefined}
        >
          {/* data-nav-skip: the arrows are the menu's own here. Without it the
              app's "way back in" (nav.ts useNavEntry) took ↓ from an item, as
              focus in a portal belongs to no region, and moved it to the tree. */}
          <BaseMenu.Popup className={'ui-menu' + (className ? ' ' + className : '')} aria-label={label} data-nav-skip="" finalFocus={returnFocus}>
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
    </AfterClose.Provider>
  );
}

type ItemProps = {
  /** What the item does; its icon comes from menuIcons.ts. A string literal
   *  (or a ternary of two) so check-menu-icons.mjs can read it. */
  fn: MenuFunction;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** The favourite star's on state: same icon, filled. */
  filled?: boolean;
  /** A shortcut hint at the right edge. Never replaces the icon. */
  chord?: string;
  /** The item opens a dialog: it runs once the menu has finished closing and
   *  focus is back on the trigger (see AfterClose), so the dialog returns
   *  focus there when it closes (research R13). */
  opensDialog?: boolean;
  closeOnClick?: boolean;
  className?: string;
  title?: string;
};

function itemClass(danger?: boolean, className?: string) {
  return 'ui-menu-item' + (danger ? ' is-danger' : '') + (className ? ' ' + className : '');
}

export function MenuItem({ fn, children, onClick, danger, disabled, filled, chord, opensDialog, closeOnClick = true, className, title }: ItemProps) {
  const afterClose = useContext(AfterClose);
  const run = () => {
    if (!onClick) return;
    if (opensDialog && afterClose) afterClose(onClick);
    else onClick();
  };
  return (
    <BaseMenu.Item className={itemClass(danger, className)} onClick={run} disabled={disabled} closeOnClick={closeOnClick} title={title}>
      <MenuIcon fn={fn} filled={filled} />
      <span className="ui-menu-label">{children}</span>
      {chord !== undefined && <kbd className="ui-menu-chord">{chord}</kbd>}
    </BaseMenu.Item>
  );
}

export function MenuCheckboxItem({
  fn,
  children,
  checked,
  onCheckedChange,
  disabled,
  closeOnClick = true,
  className,
  title,
}: {
  fn: MenuFunction;
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** false for a setting worth flipping while watching it change (Notes
   *  mode, the fonts): the menu stays open. */
  closeOnClick?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <BaseMenu.CheckboxItem
      className={itemClass(false, className)}
      checked={checked}
      onCheckedChange={(c) => onCheckedChange(c)}
      disabled={disabled}
      closeOnClick={closeOnClick}
      title={title}
    >
      <MenuIcon fn={fn} />
      <span className="ui-menu-label">{children}</span>
      <BaseMenu.CheckboxItemIndicator className="ui-menu-tick">
        <Check size={14} aria-hidden />
      </BaseMenu.CheckboxItemIndicator>
    </BaseMenu.CheckboxItem>
  );
}

/** An item that opens a submenu (→ on the keyboard). */
export function MenuSubmenu({ fn, label, children, disabled }: { fn: MenuFunction; label: ReactNode; children: ReactNode; disabled?: boolean }) {
  return (
    <BaseMenu.SubmenuRoot>
      <BaseMenu.SubmenuTrigger className={itemClass()} disabled={disabled}>
        <MenuIcon fn={fn} />
        <span className="ui-menu-label">{label}</span>
        <ChevronRight className="ui-menu-chevron" size={14} aria-hidden />
      </BaseMenu.SubmenuTrigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="ui-menu-positioner" side="right" align="start" sideOffset={2} collisionPadding={8}>
          <BaseMenu.Popup className="ui-menu" data-nav-skip="">{children}</BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.SubmenuRoot>
  );
}

/** A list of values inside a menu (workspaces, templates, columns): one
 *  function applied to the value picked, so its entries carry no function
 *  icon of their own. `reason` says why, for the reader and for the check. */
export function MenuValues({ reason, label, children }: { reason: string; label?: ReactNode; children: ReactNode }) {
  void reason;
  return (
    <BaseMenu.Group className="ui-menu-group">
      {label && <BaseMenu.GroupLabel className="ui-menu-heading">{label}</BaseMenu.GroupLabel>}
      {children}
    </BaseMenu.Group>
  );
}

/** One value in a MenuValues list. `icon` is content (a page's own icon), not
 *  a function's. */
export function MenuValueItem({
  children,
  onClick,
  icon,
  checked,
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <BaseMenu.Item className={itemClass(false, className)} onClick={onClick} disabled={disabled} title={title}>
      {icon !== undefined && <span className="ui-menu-value-icon" aria-hidden>{icon}</span>}
      <span className="ui-menu-label">{children}</span>
      {checked && <Check className="ui-menu-tick" size={14} aria-hidden />}
    </BaseMenu.Item>
  );
}

/** A value that also has actions of its own (a database template: click it to
 *  use it, → or hover for Edit / Duplicate / Move to trash). The click runs
 *  `onClick` and closes the menu through the caller's `open` state; the
 *  submenu holds the actions. One row instead of a value and a ⋯ beside it,
 *  which a keyboard could not reach inside a menu. */
export function MenuValueSubmenu({
  children,
  label,
  icon,
  onClick,
  actionsLabel,
}: {
  children: ReactNode;
  label: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  /** The submenu's accessible name, translated. */
  actionsLabel: string;
}) {
  return (
    <BaseMenu.SubmenuRoot>
      <BaseMenu.SubmenuTrigger className={itemClass()} onClick={onClick}>
        {icon !== undefined && <span className="ui-menu-value-icon" aria-hidden>{icon}</span>}
        <span className="ui-menu-label">{label}</span>
        <ChevronRight className="ui-menu-chevron" size={14} aria-hidden />
      </BaseMenu.SubmenuTrigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="ui-menu-positioner" side="right" align="start" sideOffset={2} collisionPadding={8}>
          <BaseMenu.Popup className="ui-menu" data-nav-skip="" aria-label={actionsLabel}>
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.SubmenuRoot>
  );
}

export function MenuRadioGroup({
  label,
  value,
  onValueChange,
  children,
}: {
  label?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <BaseMenu.RadioGroup className="ui-menu-group" value={value} onValueChange={(v) => onValueChange(String(v))}>
      {label && <BaseMenu.GroupLabel className="ui-menu-heading">{label}</BaseMenu.GroupLabel>}
      {children}
    </BaseMenu.RadioGroup>
  );
}

export function MenuRadioItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseMenu.RadioItem className={itemClass()} value={value} closeOnClick>
      <BaseMenu.RadioItemIndicator className="ui-menu-radio" keepMounted />
      <span className="ui-menu-label">{children}</span>
    </BaseMenu.RadioItem>
  );
}

/** A heading inside a menu ("Appearance", "Export"). Not an item. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="ui-menu-heading" role="presentation">
      {children}
    </div>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <BaseMenu.Separator className={'ui-menu-sep' + (className ? ' ' + className : '')} />;
}
