import { useContext, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import { formatRelative } from '../format';
import { toast } from '../toast';
import { Menu, type MenuPoint } from '../ui/Menu';
import { RowOpenContext } from '../pageOpen';
import { setCommentsPanelOpen } from '../commentsPanelState';
import { RowActionItems, type RowActionHandlers } from './RowActionItems';
import type { RowPlace } from '../actions/rowActions';

// A database row's menu (spec 022, US3): the table opens it from the row's
// handle, a right-click on the row and mod+/ on a focused row; the board from
// a card's ⋯ and a right-click. What it offers is the row actions list
// (rowActions.ts); what it needs to know only when it opens (is the row a
// favourite, who edited it last) is read then, once, not for every row.

/** The handlers every place shares, from what the row's view knows. */
export type RowMenuDeps = {
  onOpen: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
  onAddBelow?: (id: string) => void;
  properties?: { id: string; name: string }[];
  onEditProperty?: (id: string, propId: string) => void;
  onDuplicate?: (id: string) => void;
  onTrash?: (id: string, title: string) => void;
  /** The board's Move to (its columns), drawn by the board. */
  moveToColumn?: ReactNode;
};

/** What the menu shows about the row, read when it opens: whether it is a
 *  favourite, and "Edited {time} by {name}" from its newest activity entry
 *  that is not a move (a move is not an edit, research R6). */
function useRowFacts(rowId: string) {
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api
      .listFavorites()
      .then((ids) => live && setFavorite(ids.includes(rowId)))
      .catch(() => {});
    api
      .audit(undefined, rowId)
      .then((entries) => {
        const last = entries.find((e) => e.action !== 'reorder_page');
        if (live && last) setEdited(t('Edited {time} by {name}', { time: formatRelative(last.createdAt), name: last.actorName }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [rowId]);
  return { favorite, setFavorite, edited };
}

/** The items of a row's menu for one place, with the handlers every place
 *  shares and the facts read when the menu opens. Rendered inside an open
 *  menu only, so its reads happen then. */
export function RowMenuItems({ place, row, deps }: { place: RowPlace; row: { id: string; title: string }; deps: RowMenuDeps }) {
  const { onPeek } = useContext(RowOpenContext);
  const { favorite, setFavorite, edited } = useRowFacts(row.id);
  const id = row.id;
  const handlers: RowActionHandlers = {
    open: () => deps.onOpen(id),
    openInSidePeek: onPeek ? () => onPeek(id, 'side') : undefined,
    openInCenterPeek: onPeek ? () => onPeek(id, 'center') : undefined,
    openInNewTab: deps.onOpenInNewTab ? () => deps.onOpenInNewTab!(id) : undefined,
    addRowBelow: deps.onAddBelow ? () => deps.onAddBelow!(id) : undefined,
    editProperty:
      deps.onEditProperty && deps.properties
        ? { properties: deps.properties, onPick: (propId) => deps.onEditProperty!(id, propId) }
        : undefined,
    // The row opens the way its view opens rows, with the comments panel
    // open (it reads its stored state when it mounts).
    comment: () => {
      setCommentsPanelOpen(true);
      deps.onOpen(id);
    },
    favorite:
      favorite === null
        ? undefined
        : {
            on: favorite,
            toggle: () => {
              const next = !favorite;
              setFavorite(next);
              (next ? api.addFavorite(id) : api.removeFavorite(id))
                .then(() => window.dispatchEvent(new Event('nigari:favorites-changed')))
                .catch(() => {
                  setFavorite(!next);
                  toast(t('Change not saved'));
                });
            },
          },
    copyLink: () => {
      const url = `${location.origin}/p/${id}`;
      navigator.clipboard?.writeText(url).then(
        () => toast(t('Link copied')),
        () => toast(t('Change not saved')),
      );
    },
    duplicate: deps.onDuplicate ? () => deps.onDuplicate!(id) : undefined,
    moveToColumn: deps.moveToColumn,
    moveToTrash: deps.onTrash ? () => deps.onTrash!(id, row.title) : undefined,
  };
  return <RowActionItems place={place} handlers={handlers} edited={edited} />;
}

/** The table's row menu: one for the table, opened at a point for one row. */
export function RowMenu({
  place,
  row,
  point,
  onClose,
  returnFocus,
  deps,
}: {
  place: RowPlace;
  /** The row the menu is open for; null when closed. */
  row: { id: string; title: string } | null;
  point: MenuPoint | null;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
  deps: RowMenuDeps;
}) {
  return (
    <Menu
      label={t('Row actions')}
      open={!!row}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      anchorPoint={point}
      returnFocus={returnFocus}
      narrow="sheet"
    >
      {row && <RowMenuItems key={row.id} place={place} row={row} deps={deps} />}
    </Menu>
  );
}
