import { forwardRef, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { t } from '../i18n';
import type { ViewDef } from '../types';
import { Menu, MenuItem, MenuSeparator, MenuValueItem, MenuValues, type MenuPoint } from '../ui/Menu';

// The database's menus (spec 010, part 2), moved out of CollectionView.tsx when
// they became ui/Menu: the view actions (a tab's right-click and the toolbar's
// ⋯ share one list), the ＋ for a new view, and a board card's menu.

/** Rename, move left/right, remove: the actions on one view. The same list
 *  for a tab's right-click and for the toolbar's ⋯, so the two cannot drift.
 *  Move and remove only exist with a second view; at an end of the strip the
 *  move is greyed rather than hidden, so the pair keeps its place. */
export function ViewActionItems({
  view,
  views,
  onRename,
  onMove,
  onRemove,
  rename = true,
}: {
  view: ViewDef;
  views: ViewDef[];
  onRename: (v: ViewDef) => void;
  onMove: (v: ViewDef, delta: -1 | 1) => void;
  onRemove: (v: ViewDef) => void;
  /** false in the Settings menu, which puts Rename view at its top, with the
   *  view's other settings, and the moves and the removal after a divider. */
  rename?: boolean;
}) {
  return (
    <>
      {rename && (
        <MenuItem fn="rename" opensDialog onClick={() => onRename(view)}>
          {t('Rename view')}
        </MenuItem>
      )}
      {views.length > 1 && (
        <>
          <MenuItem fn="moveLeft" disabled={views[0]?.id === view.id} onClick={() => onMove(view, -1)}>
            {t('Move left')}
          </MenuItem>
          <MenuItem fn="moveRight" disabled={views[views.length - 1]?.id === view.id} onClick={() => onMove(view, 1)}>
            {t('Move right')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem fn="delete" danger onClick={() => onRemove(view)}>
            {t('Remove view')}
          </MenuItem>
        </>
      )}
    </>
  );
}

/** The ＋ after the tabs: a new view of one of eight types. The types are
 *  values of one function, "add a view", and keep the icon their tab shows
 *  (research R1), so the menu and the strip agree. */
export function AddViewMenu({
  types,
  icon,
  label,
  onAdd,
}: {
  types: ViewDef['type'][];
  icon: (type: ViewDef['type']) => ReactNode;
  label: (type: ViewDef['type']) => string;
  onAdd: (type: ViewDef['type']) => void;
}) {
  return (
    <Menu
      label={t('Add view')}
      align="start"
      narrow="sheet"
      trigger={<AddViewButton />}
    >
      <MenuValues reason="View types are values of one function, add a view; each keeps the icon its tab shows">
        {types.map((vt) => (
          <MenuValueItem key={vt} icon={icon(vt)} onClick={() => onAdd(vt)}>
            {label(vt)}
          </MenuValueItem>
        ))}
      </MenuValues>
    </Menu>
  );
}

const AddViewButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(function AddViewButton(props, ref) {
  return (
    <button ref={ref} className="view-add" title={t('Add view')} aria-label={t('Add view')} {...props}>
      <Plus size={15} aria-hidden />
    </button>
  );
});

/** A board card's ⋯, also opened by a right-click on the card at the pointer.
 *  Mounted once the card is first hovered (or opened), not for every card of
 *  a board with hundreds: the same reason as the sidebar's rows. */
export function CardMenu({
  open,
  point,
  onOpenChange,
  returnFocus,
  children,
}: {
  open: boolean;
  point: MenuPoint | null;
  onOpenChange: (open: boolean) => void;
  returnFocus?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState<false | 'pointer' | 'focus'>(false);
  useEffect(() => {
    const card = ref.current?.closest('.board-card');
    if (!card || armed) return;
    const byPointer = () => setArmed('pointer');
    // The ⋯ is a Tab stop even while it is transparent: a keyboard reaches it
    // without hovering. Arm then too, and put focus on the trigger that
    // replaces the plain button, or it would fall to the page.
    const byFocus = (e: FocusEvent) => {
      if (ref.current?.contains(e.target as Node)) setArmed('focus');
    };
    card.addEventListener('pointerenter', byPointer);
    card.addEventListener('focusin', byFocus as EventListener);
    return () => {
      card.removeEventListener('pointerenter', byPointer);
      card.removeEventListener('focusin', byFocus as EventListener);
    };
  }, [armed]);
  useEffect(() => {
    if (armed === 'focus') ref.current?.querySelector('button')?.focus();
  }, [armed]);
  return (
    <span ref={ref} className="card-move" onClick={(e) => e.stopPropagation()}>
      {armed || open ? (
        <Menu
          label={t('Row actions')}
          align="end"
          open={open}
          anchorPoint={point}
          returnFocus={returnFocus}
          onOpenChange={onOpenChange}
          trigger={<CardMoreButton />}
        >
          {children}
        </Menu>
      ) : (
        <CardMoreButton onClick={() => onOpenChange(true)} />
      )}
    </span>
  );
}

const CardMoreButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(function CardMoreButton(props, ref) {
  return (
    <button ref={ref} className="card-move-btn" title={t('More')} aria-label={t('More')} {...props}>
      ⋯
    </button>
  );
});
