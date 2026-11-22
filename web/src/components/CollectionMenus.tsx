import { forwardRef, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import type { ViewDef } from '../types';
import { Menu, MenuItem, MenuLabel, MenuSeparator, MenuSubmenu, MenuValueItem, MenuValues, type MenuPoint, MenuRadioGroup, MenuRadioItem } from '../ui/Menu';

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
/** The view types as menu values, each with its tab's icon: the add-view
 *  menu's list and a view's Layout (spec 018), one list so the two cannot
 *  offer different types or icons. current is ticked. */
export function ViewTypeItems({
  types,
  icon,
  label,
  current,
  onPick,
  reason,
}: {
  types: ViewDef['type'][];
  icon: (type: ViewDef['type']) => ReactNode;
  label: (type: ViewDef['type']) => string;
  current?: ViewDef['type'];
  onPick: (type: ViewDef['type']) => void;
  reason: string;
}) {
  // With a current type (a view's Layout) it is one choice among eight:
  // radio items, so a screen reader hears which one is checked (the tick
  // alone was an aria-hidden icon, spec 018 ux audit).
  if (current !== undefined) {
    return (
      <MenuRadioGroup value={current} onValueChange={(v) => onPick(v as ViewDef['type'])}>
        {types.map((vt) => (
          <MenuRadioItem key={vt} value={vt} icon={icon(vt)}>
            {label(vt)}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    );
  }
  return (
    <MenuValues reason={reason}>
      {types.map((vt) => (
        <MenuValueItem key={vt} icon={icon(vt)} checked={vt === current} onClick={() => onPick(vt)}>
          {label(vt)}
        </MenuValueItem>
      ))}
    </MenuValues>
  );
}

/** A database's views as one menu instead of a row of tabs: on a phone the
 *  tabs filled the toolbar and pushed Filter, Sort, Settings and New off
 *  screen (owner, 2026-11-22). The button names the open view; the menu
 *  lists every view, the open one checked, and adds a view at its foot.
 *  Renaming, moving and removing a view stay in its Settings menu. */
export function ViewPicker({
  views,
  current,
  icon,
  onPick,
  add,
}: {
  views: ViewDef[];
  current: ViewDef;
  icon: (type: ViewDef['type']) => ReactNode;
  onPick: (id: string) => void;
  /** Left out for someone who may not change the views. */
  add?: Omit<Parameters<typeof AddViewMenu>[0], 'icon'>;
}) {
  return (
    <Menu
      label={t('Views')}
      align="start"
      narrow="sheet"
      className="view-picker-menu"
      trigger={<ViewPickerButton icon={icon(current.type)} name={current.name} />}
    >
      <MenuRadioGroup label={t('Views')} value={current.id} onValueChange={onPick}>
        {views.map((v) => (
          <MenuRadioItem key={v.id} value={v.id} icon={icon(v.type)}>
            {v.name}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
      {add && (
        <>
          <MenuSeparator />
          <MenuSubmenu fn="addView" label={t('Add view')}>
            <ViewTypeItems
              types={add.types}
              icon={icon}
              label={add.label}
              onPick={add.onAdd}
              reason="View types are values of one function, add a view; each keeps the icon its tab shows"
            />
            {add.copy && add.copy.views.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>{t('Views on {name}', { name: add.copy.databaseName })}</MenuLabel>
                <MenuValues reason="The database's views are values of one function, add a view; each keeps the icon its type has">
                  {add.copy.views.map((v) => (
                    <MenuValueItem key={v.id} icon={icon(v.type)} onClick={() => add.copy!.onCopy(v)}>
                      {v.name}
                    </MenuValueItem>
                  ))}
                </MenuValues>
              </>
            )}
          </MenuSubmenu>
        </>
      )}
    </Menu>
  );
}

const ViewPickerButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'> & { icon: ReactNode; name: string }>(
  function ViewPickerButton({ icon, name, ...props }, ref) {
    // A Menu trigger clones its props onto this button (Base UI), so they are
    // passed through to ui/Button.
    return (
      <Button ref={ref} {...(props as object)} emphasis="low" size="sm" className="view-picker" icon={icon}>
        <span className="view-picker-name">{name}</span>
        <ChevronDown size={14} aria-hidden className="view-picker-chev" />
      </Button>
    );
  },
);

export function AddViewMenu({
  types,
  icon,
  label,
  onAdd,
  copy,
}: {
  types: ViewDef['type'][];
  icon: (type: ViewDef['type']) => ReactNode;
  label: (type: ViewDef['type']) => string;
  onAdd: (type: ViewDef['type']) => void;
  /** In a document's embed (spec 014): the database's views, to start the
   *  embed's own from. Picking one adds a copy; the database's stays as it is. */
  copy?: { databaseName: string; views: ViewDef[]; onCopy: (view: ViewDef) => void };
}) {
  return (
    <Menu
      label={t('Add view')}
      align="start"
      narrow="sheet"
      trigger={<AddViewButton />}
    >
      <ViewTypeItems
        types={types}
        icon={icon}
        label={label}
        onPick={onAdd}
        reason="View types are values of one function, add a view; each keeps the icon its tab shows"
      />
      {copy && copy.views.length > 0 && (
        <>
          <MenuSeparator />
          <MenuLabel>{t('Views on {name}', { name: copy.databaseName })}</MenuLabel>
          <MenuValues reason="The database's views are values of one function, add a view; each keeps the icon its type has">
            {copy.views.map((v) => (
              <MenuValueItem key={v.id} icon={icon(v.type)} onClick={() => copy.onCopy(v)}>
                {v.name}
              </MenuValueItem>
            ))}
          </MenuValues>
        </>
      )}
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
