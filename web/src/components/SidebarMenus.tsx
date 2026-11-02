import { useEffect, useRef, useState } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import { api } from '../api';
import { toast } from '../toast';
import { t } from '../i18n';
import { chordFor } from '../keys';
import { Menu, MenuItem, MenuSeparator, MenuSubmenu, MenuValueItem, MenuValues, type MenuPoint } from '../ui/Menu';
import type { TreeCtx } from './Sidebar';

// The ＋ and ⋯ of a sidebar row (spec 010), moved out of Sidebar.tsx when they
// became ui/Menu. One component for a tree item and a database row alike: two
// copies would be two answers to "what can you do with a page", and the row's
// copy would be the one that quietly falls behind.

/** A right-click on a row opens the same ⋯ menu, at the pointer. One menu
 *  open at a time across the tree (the shared menuFor), and the ＋ closes.
 *  A context-menu key or Shift+F10 reports (0, 0): then it opens under the ⋯
 *  as if clicked. */
export function openRowMenu(ctx: TreeCtx, id: string, e: React.MouseEvent<HTMLElement>) {
  e.preventDefault();
  // Focus comes back to the row, not to its ⋯, which hides again when the
  // menu closes unless the pointer is on the row (Shift+F10, then Escape).
  ctx.menuReturn.current = e.currentTarget;
  ctx.setAddFor(null);
  ctx.setMenuPoint(e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : null);
  ctx.setMenuFor(id);
}

export function RowActions({
  id,
  title,
  parentId,
  workspaceId,
  ctx,
}: {
  id: string;
  title: string;
  parentId?: string | null;
  workspaceId?: string;
  ctx: TreeCtx;
}) {
  // A row's two menus are mounted once the row is first hovered (or one of
  // them is opened by a right-click), not for every row of the tree: a
  // workspace with hundreds of pages would otherwise build hundreds of menu
  // roots on every re-render of the sidebar. Until then the buttons are plain;
  // they only show on hover anyway, so the swap happens before a click.
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(false);
  const open = ctx.menuFor === id || ctx.addFor === id;
  useEffect(() => {
    const row = ref.current?.parentElement;
    if (!row || armed) return;
    const arm = () => setArmed(true);
    row.addEventListener('pointerenter', arm);
    return () => row.removeEventListener('pointerenter', arm);
  }, [armed]);
  if (!armed && !open) {
    return (
      <span className="tree-actions" onClick={(e) => e.stopPropagation()} ref={ref}>
        <button title={t('Add inside')} aria-label={t('Add inside')} onClick={() => ctx.setAddFor(id)}>
          <Plus size={14} />
        </button>
        <button title={t('More')} aria-label={t('More')} onClick={() => ctx.setMenuFor(id)}>
          <MoreHorizontal size={14} />
        </button>
      </span>
    );
  }
  return (
    <span className="tree-actions" onClick={(e) => e.stopPropagation()} ref={ref}>
      <AddMenu id={id} ctx={ctx} />
      <PageMenu id={id} title={title} parentId={parentId} workspaceId={workspaceId} ctx={ctx} />
    </span>
  );
}

// What the ＋ on a tree item or a database row offers: a page or a collection
// inside it. The section headers keep their direct ＋: under "Documents" and
// "Collections" the section IS the answer.
function AddMenu({ id, ctx }: { id: string; ctx: TreeCtx }) {
  return (
    <Menu
      label={t('Add inside')}
      align="start"
      open={ctx.addFor === id}
      onOpenChange={(o) => {
        if (o) ctx.setMenuFor(null);
        ctx.setAddFor(o ? id : null);
      }}
      trigger={
        <button title={t('Add inside')} aria-label={t('Add inside')}>
          <Plus size={14} />
        </button>
      }
    >
      <MenuItem fn="newPage" onClick={() => ctx.onCreateChild(id)}>
        {t('Page')}
      </MenuItem>
      <MenuItem fn="newCollection" onClick={() => ctx.onCreateChildDb(id)}>
        {t('Collection')}
      </MenuItem>
    </Menu>
  );
}

function PageMenu({
  id,
  title,
  parentId,
  workspaceId,
  ctx,
}: {
  id: string;
  title: string;
  parentId?: string | null;
  workspaceId?: string;
  ctx: TreeCtx;
}) {
  const open = ctx.menuFor === id;
  const point: MenuPoint | null = open ? ctx.menuPoint : null;
  const others = ctx.workspaces.filter((w) => w.id !== workspaceId);
  return (
    <Menu
      label={t('Page actions')}
      align="start"
      open={open}
      anchorPoint={point}
      returnFocus={ctx.menuReturn.current ? ctx.menuReturn : undefined}
      onOpenChange={(o) => {
        if (o) {
          // Opened by the ⋯ itself: focus goes back to it.
          ctx.menuReturn.current = null;
          ctx.setAddFor(null);
          ctx.setMenuPoint(null);
        }
        ctx.setMenuFor(o ? id : null);
      }}
      trigger={
        <button title={t('More')} aria-label={t('More')}>
          <MoreHorizontal size={14} />
        </button>
      }
    >
      {/* The visible way to get a second tab — ⌘-click and middle-click
          exist too, but nothing in the interface said so. */}
      <MenuItem fn="openInNewTab" onClick={() => ctx.onOpenInNewTab(id)}>
        {t('Open in new tab')}
      </MenuItem>
      <MenuItem fn="favorite" filled={ctx.favorites.has(id)} onClick={() => ctx.onToggleFavorite(id)}>
        {ctx.favorites.has(id) ? t('Remove from favorites') : t('Add to favorites')}
      </MenuItem>
      <MenuItem fn="duplicate" onClick={() => ctx.onDuplicate(id)}>
        {t('Duplicate')}
      </MenuItem>
      <MenuItem fn="newCollection" onClick={() => ctx.onCreateChildDb(id)}>
        {t('New collection inside')}
      </MenuItem>
      {/* Only when there is a parent to leave. A database dragged into
          another one had no way back at all: it lives in that one's
          subtree, and nothing in the interface moved it out. */}
      {parentId && (
        <MenuItem fn="moveToTopLevel" onClick={() => ctx.onMoveToTop(id)}>
          {t('Move to top level')}
        </MenuItem>
      )}
      {others.length > 0 && (
        <MenuSubmenu fn="moveTo" label={t('Move to workspace')}>
          <MenuValues reason="Workspaces are values of one function, moveTo: the page moves to the one picked">
            {others.map((w) => (
              <MenuValueItem key={w.id} onClick={() => ctx.onMoveToWorkspace(id, w.id, w.name)}>
                {w.name}
              </MenuValueItem>
            ))}
          </MenuValues>
        </MenuSubmenu>
      )}
      <MenuItem fn="showFiles" opensDialog onClick={() => ctx.onShowFiles(id, title || t('Untitled'))}>
        {t('Files in this subtree')}
      </MenuItem>
      <MenuItem
        fn="saveAsTemplate"
        onClick={() =>
          // A template is a SNAPSHOT: the copy becomes the template and
          // keeps this moment's state; the page here stays a normal page.
          // (Flagging the page itself kept template and original one
          // object — editing either changed "the template".)
          void api
            .duplicatePage(id, false, true)
            .then(() => toast(t('Saved as template')))
            .catch(() => toast(t('Could not save as template')))
        }
      >
        {t('Save as template')}
      </MenuItem>
      {/* A row's own kind of template: it belongs to the database, which
          offers it from its New button. The plain entry above would make
          the copy one more row of the same database. */}
      {parentId && ctx.isCollection(parentId) && (
        <MenuItem
          fn="saveAsTemplate"
          onClick={() =>
            void api
              .addDatabaseTemplate(parentId, { fromPageId: id })
              .then(() => toast(t('Saved as a template of this database')))
              .catch(() => toast(t('Could not save as template')))
          }
        >
          {t('Save as a template of this database')}
        </MenuItem>
      )}
      <MenuItem fn="exportMarkdown" onClick={() => api.download(`/api/export/${id}`)}>
        {t('Export Markdown')}
      </MenuItem>
      <MenuSeparator />
      {/* The chord is read from the registry rather than typed in here, so
          the menu cannot go on advertising a chord that has moved. */}
      <MenuItem fn="moveToTrash" danger chord={chordFor('page.trash')} onClick={() => ctx.onTrash(id)}>
        {t('Move to trash')}
      </MenuItem>
    </Menu>
  );
}
