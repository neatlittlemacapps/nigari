import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PeekMode } from '../peek';
import { api, ApiError } from '../api';
import { usePersonalViews } from '../usePersonalViews';
import { hasPersonalChange, mergeViewState, viewScope, withFoldedLane, withPersonalEdit, withQuickPick, withoutViewChanges } from '../viewState';
import { laneIsReadOnly, quickFilterProps } from '../quickFilters';
import QuickFilters from './QuickFilters';
import ViewChangeBar from './ViewChangeBar';
import { onRefresh } from '../pwa';
import Portal from './Portal';
import { anchoredMenuStyle } from '../anchoredMenu';
import { sortComparator } from '../viewSort';
import { orderedColumns, storedOrder, moveColumn, moveToGap, useColumnDrag } from '../columnDrag';
import { ColHead } from './TableColumnHead';
import { tagColorClass } from '../tags';
import { compare, firstWeekday, formatDay, formatMonth, isReadableDay, isUnfinishedRelativeDay, resolveSmartDate, toDayString, today, weekdayNames } from '../format';
import { plural, t } from '../i18n';
import { confirm, promptText } from '../dialog';
import type {
  CollectionConfig,
  Filter,
  FilterOp,
  Page,
  PageMeta,
  PropDef,
  PropOption,
  PropType,
  Sort,
  ViewDef,
} from '../types';
import PropertyValue, { idList, loadRelationOptions, type RelOption } from './PropertyValue';
import { openCollectionRow, openPageAux, RowOpenContext, useOpenRow } from '../pageOpen';
import ViewSettingsMenu from './ViewSettingsMenu';
import ViewsLockMarker, { setViewsLocked } from './ViewsLockMarker';
import { AddViewMenu, ViewActionItems } from './CollectionMenus';
import { Menu, MenuItem, MenuLabel, MenuSeparator, MenuValues, MenuValueSubmenu, type MenuPoint } from '../ui/Menu';
import { readViewId, readViewScroll, writeViewId, writeViewScroll } from '../pageUiState';
import { AgentDot } from './AgentBadge';
import SchemaEditor from './SchemaEditor';
import GalleryView from './GalleryView';
import ListView from './ListView';
import BoardView from './BoardView';
import { groupValueFor, UNSET, type Row } from '../collectionRow';
import { defaultChartView } from '../chartDefaults';
import { copyDatabaseView, copyableViews, encodeEmbedLocal, moveView as moveEmbedView, newEmbedViewId, readEmbedLocal, removeView as removeEmbedView, withOpenView } from '../embedViews';

// A chart (spec 004) brings Chart.js, about 60 KB gzip: loaded only when a
// chart view is shown, so nobody who never opens one pays for it (SC-006).
const ChartPane = lazy(() => import('./ChartPane'));
import { PageIcon } from '../pageIcon';
import { toast } from '../toast';
import { Table2, Columns3, LayoutGrid, CalendarDays, List, Plus, Filter as FilterIcon, ArrowUpDown, Calendar, ClipboardList, Check, Send, Share2, Globe, ChartPie, GanttChartSquare, ChevronDown, LayoutTemplate, Copy } from 'lucide-react';

/** A collection shown inside a document rather than as its own page.
 *
 *  The rows stay the collection's: an edit in an embed is an edit everywhere.
 *  The views are the embed's own (spec 014): a list of them kept in the
 *  document, so adding, renaming, filtering or removing one changes nothing
 *  on the database page or in any other document. They are kept as the block's
 *  `local` string; embedViews.ts reads it in the shape written now and in the
 *  shape written before, which is read as a copy of the database's views. */
export interface EmbedState {
  /** The block's `local` as stored, or as a reader who cannot change the
   *  document last left it. */
  local: string;
  /** Writes the next `local`: into the block, or for a reader only into the
   *  browser. */
  onLocal: (next: string) => void;
  /** Where this embed sits: with the view id, the scope a person's own
   *  filter and sort for it are kept under (spec 013, viewState.ts). */
  pageId?: string;
  blockId?: string;
  /** Whether the person may change the document, and so the embed's views. */
  canSave?: boolean;
  /** Whether the person may write the database (not only read it), and so
   *  change its properties from here (R9). Absent: yes. */
  canEditDatabase?: boolean;
}

interface Props {
  collectionId: string;
  pages: Map<string, PageMeta>;
  tagColors: Record<string, string>;
  onNavigate: (id: string) => void;
  /** ⌘/Ctrl-click and middle-click on a row open a second tab; a plain click
   *  navigates the one you are in (see pageOpen). */
  onOpenInNewTab?: (id: string) => void;
  /** Opens a row in a peek beside the view, for a view set to one (spec 007).
   *  Without it such a view navigates. */
  onPeek?: (id: string, mode: PeekMode) => void;
  onPagesChanged: () => void;
  /** Opens one of this database's templates for editing, in a dialog. Without
   *  it (an embedded view) the template opens as a page instead. */
  onEditTemplate?: (id: string) => void;
  embed?: EmbedState;
  /** False for a viewer of the workspace: charts then show no settings
   *  (spec 004, FR-027). The server decides in the end. */
  canEdit?: boolean;
}

function isEmptyVal(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  return v === undefined || v === '' || v === null || v === false;
}

/** What a condition compares against: the set if there is one, else the single
 *  value. Never both — the same rule the server applies (rowFilter.vals). */
export function filterValues(f: Filter): string[] {
  if (f.values?.length) return f.values;
  return f.value ? [f.value] : [];
}

/** Is this condition finished enough to mean anything? An unfinished one must
 *  not filter: comparing against the empty string emptied the table the moment
 *  somebody added "Date is …", before they had typed a thing, which is what
 *  made the date filter look broken. `is_empty` is the deliberate version.
 *  A half-typed relative day ("today-") waits the same way, and on a date
 *  property so does anything that is not a day yet (see liveValue). */
export function filterIsArmed(f: Filter, isDate = false): boolean {
  const op = f.op ?? (f.value ? 'is' : 'is_not_empty');
  if (op === 'is_empty' || op === 'is_not_empty') return true;
  const live = (v: string) => liveValue(v, op, isDate);
  if (op === 'between') return !!f.value && (f.value2 ?? '') !== '' && live(f.value ?? '') && live(f.value2 ?? '');
  const vals = filterValues(f);
  return vals.length > 0 && vals.some(live);
}

/** May this value take part in the comparison? On a date property only a day
 *  or a relative day that resolves can (isReadableDay), except under
 *  "contains", which looks for text. Elsewhere only the dangling sign of a
 *  half-typed relative day waits. The server drops the same values. */
function liveValue(v: string, op: FilterOp, isDate: boolean): boolean {
  return isDate && op !== 'contains' ? isReadableDay(v) : !isUnfinishedRelativeDay(v);
}

function matchesFilter(row: Row, f: Filter, isDate: boolean): boolean {
  const v = row.props[f.property];
  const op = f.op ?? (f.value ? 'is' : 'is_not_empty');
  if (!filterIsArmed(f, isDate)) return true;
  // A relative day names a different date every day. Resolve it now — the
  // same way the server resolves it per query — or the rows the server sent
  // and the rows shown here would disagree. Date properties only: a status
  // option named "Today" must keep matching the option, not the date.
  const day = (s: string) => (isDate ? (resolveSmartDate(s) ?? s) : s);
  const live = (s: string) => liveValue(s, op, isDate);
  const value = day(f.value ?? '');
  const vals = filterValues(f)
    .filter(live)
    .map(day);
  // One value or several, the question is the same: does the cell hold any of
  // them. A cell may itself be a list (multiselect, relation).
  const holdsAny = () =>
    Array.isArray(v)
      ? vals.some((x) => v.includes(x))
      : vals.some((x) =>
          x === 'true' || x === 'false' ? String(v === true) === x : String(v ?? '') === x,
        );
  switch (op) {
    case 'is_empty':
      return isEmptyVal(v);
    case 'is_not_empty':
      return !isEmptyVal(v);
    case 'contains': {
      const needle = value.toLowerCase();
      if (Array.isArray(v)) return v.some((x) => String(x).toLowerCase().includes(needle));
      return String(v ?? '').toLowerCase().includes(needle);
    }
    case 'gt':
    case 'lt': {
      const nv = Number(v);
      const nf = Number(value);
      const cmp = !Number.isNaN(nv) && !Number.isNaN(nf) ? nv - nf : compare(String(v ?? ''), value);
      return op === 'gt' ? cmp > 0 : cmp < 0;
    }
    case 'between': {
      // Inclusive at both ends — a range named by two dates contains them.
      // ISO dates compare correctly as text, so only numbers need Number().
      const hi = f.value2 === undefined ? '' : isDate ? (resolveSmartDate(f.value2) ?? f.value2) : f.value2;
      const nv = Number(v);
      if (!Number.isNaN(nv) && !Number.isNaN(Number(value)) && !Number.isNaN(Number(hi))) {
        return nv >= Number(value) && nv <= Number(hi);
      }
      const sv = String(v ?? '');
      return sv !== '' && sv >= value && sv <= hi;
    }
    case 'is_not':
      return !holdsAny();
    case 'is':
    default:
      // Checkbox filters compare against a boolean; a never-toggled box has no
      // stored value, which must count as "false" (unchecked), not "no match".
      return holdsAny();
  }
}

// Apply a view's filters and sort to the row set.
function applyView(rows: Row[], view: ViewDef, schema: PropDef[]): Row[] {
  const dateProps = new Set(schema.filter((p) => p.type === 'date').map((p) => p.id));
  let out = rows;
  for (const f of view.filters ?? []) {
    const isDate = dateProps.has(f.property);
    out = out.filter((r) => matchesFilter(r, f, isDate));
  }
  // The board's drop marker (dropIndex) sorts with the same comparator, so it
  // shows the place this sort will give a dropped card.
  if (view.sort) out = [...out].sort(sortComparator<Row>(view.sort));
  return out;
}

export default function CollectionView({ collectionId, pages, tagColors, onNavigate, onOpenInNewTab, onPeek, onPagesChanged, onEditTemplate, embed, canEdit = true }: Props) {
  const [config, setConfig] = useState<CollectionConfig | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  // A full page remembers its view across tab switches and reloads (see
  // pageUiState). An embed never touches that store: its view lives in the
  // block itself, and borrowing the page's would couple every embed of the
  // collection to the last visited page.
  const [pageViewId, setViewId] = useState<string>(() => (embed ? '' : (readViewId(collectionId) ?? '')));
  // In a document the embed's own list says which view is open and which
  // views there are; the database's config only supplies what an embed in the
  // old shape is a copy of.
  const embedRead = useMemo(
    () => (embed && config ? readEmbedLocal(embed.local, config.views, t('Table')) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [embed?.local, config?.views],
  );
  const viewId = embedRead ? embedRead.viewId : pageViewId;
  const pickView = (id: string) => {
    // An embed keeps its view to itself; a full page remembers it across tab
    // switches and reloads (see pageUiState).
    if (embed && config) {
      embed.onLocal(withOpenView(embed.local, config.views, id, t('Table')));
      return;
    }
    setViewId(id);
    writeViewId(collectionId, id);
  };
  const [schemaOpen, setSchemaOpen] = useState(false);
  // The person's own filter and sort per view (spec 013, US1).
  const personal = usePersonalViews(collectionId);
  // A popover of the filter or sort controls is open: with the templates
  // menu, what keeps an embed's folding toolbar shown (data-menu-open).
  const [fsOpen, setFsOpen] = useState(false);
  // The arrow beside New: this database's own templates, loaded when it opens
  // so the list is never older than the click.
  const [tplOpen, setTplOpen] = useState(false);
  const [tpls, setTpls] = useState<PageMeta[] | null>(null);
  const openTemplates = () => {
    setTpls(null);
    setTplOpen(true);
    api.databaseTemplates(collectionId).then(setTpls).catch(() => setTpls([]));
  };
  const reloadTemplates = () => api.databaseTemplates(collectionId).then(setTpls).catch(() => setTpls([]));
  const duplicateTemplate = async (p: PageMeta) => {
    try {
      await api.addDatabaseTemplate(collectionId, {
        fromPageId: p.id,
        title: t('Copy of {name}').replace('{name}', p.title || t('Untitled')),
      });
      await reloadTemplates();
    } catch {
      toast(t('Could not create the template'));
    }
  };
  const trashTemplate = async (p: PageMeta) => {
    try {
      await api.trashPage(p.id);
      await reloadTemplates();
    } catch {
      toast(t('Could not be changed'));
    }
  };
  const addRowFromTemplate = async (templateId: string) => {
    setTplOpen(false);
    try {
      const row = await api.rowFromTemplate(collectionId, { templateId, viewId: rowViewId(), viewScope: rowViewScope(), viewFilters: rowViewFilters() });
      onPagesChanged();
      announceIfHidden(row);
    } catch {
      toast(t('The template could not be used'));
    }
  };
  const newTemplate = async () => {
    setTplOpen(false);
    try {
      const p = await api.addDatabaseTemplate(collectionId);
      (onEditTemplate ?? onNavigate)(p.id);
    } catch {
      toast(t('Could not create the template'));
    }
  };

  // Open comments per row. Trello shows on every card whether anything was
  // discussed there — on a sales board the course of the conversation sits
  // exactly there and not in the description. In ONE query for the whole
  // workspace, not per card (see handleCommentCounts).
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const workspaceId = pages.get(collectionId)?.workspaceId ?? '';
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    api
      .commentCounts(workspaceId)
      .then((c) => alive && setCommentCounts(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Deliberately hangs off workspaceId alone: `pages` gets a new identity on
    // every change and would set off an endless loop here.
  }, [workspaceId]);

  // Mirror for the callback below: `embed` is an inline object at some call
  // sites, so depending on it would refetch the config on every render.
  const embedRef = useRef(embed);
  embedRef.current = embed;

  const loadConfig = useCallback(() => {
    void api
      .getCollection(collectionId)
      .then((c) => {
        setConfig(c);
        setViewId((v) => {
          // The open view survives tab switches and reloads; it only falls
          // back when it is gone (a removed view) or was never chosen.
          if (v && c.views.some((x) => x.id === v)) return v;
          const stored = embedRef.current ? null : readViewId(collectionId);
          if (stored && c.views.some((x) => x.id === stored)) return stored;
          return c.views[0]?.id || '';
        });
      });
  }, [collectionId]);

  const [total, setTotal] = useState(0);
  const [viewMenuFor, setViewMenuFor] = useState<string | null>(null);
  // A right-click on a view's tab opens the same actions the ⋯ holds, for THAT
  // view, at the pointer (#24). The ⋯ only ever acted on the view you are on.
  // Focus goes back to the tab the menu was opened on.
  // The view and point stay after the menu closes, so its exit animation does
  // not show an empty popup jumping to a default place; `open` is separate.
  const [tabMenu, setTabMenu] = useState<{ view: ViewDef; point: MenuPoint } | null>(null);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const tabMenuReturn = useRef<HTMLElement | null>(null);
  const PAGE = 200;

  // Rows are fetched from the server (filtered/paginated there), NOT from the
  // global page list — a database can have tens of thousands of rows that must
  // not choke the sidebar tree load.
  // The views this component shows: the database's, or in a document the
  // embed's own.
  const views = embedRead ? embedRead.views : config?.views;
  const savedView = views?.find((v) => v.id === viewId) ?? views?.[0];
  // The view as everyone sees it…
  const sharedView = savedView;
  // …and as this person sees it: their own filter and sort laid over it
  // (spec 013, US1). A form has no filters. An embed without a place (a
  // bare context) keeps the old behaviour: its filters go to the document.
  const personalScope =
    sharedView && sharedView.type !== 'form' && (!embed || (embed.pageId && embed.blockId))
      ? viewScope(sharedView.id, embed ? { pageId: embed.pageId!, blockId: embed.blockId! } : null)
      : null;
  const personalState = personalScope ? personal.states[personalScope] : undefined;
  // Only quick filters that still are: a pick for a property deleted or
  // retyped since would narrow the view with no chip to show or clear it
  // (code review). The server drops the same ones (liveQuickFilters).
  const liveView = sharedView && {
    ...sharedView,
    quickFilters: (sharedView.quickFilters ?? []).filter((id) => quickFilterProps(config?.schema ?? []).some((p) => p.id === id)),
  };
  const view0 = liveView && personalScope ? { ...sharedView, ...mergeViewState(liveView, personalState) } : sharedView;
  const personalChange = !!liveView && !!personalScope && hasPersonalChange(liveView, personalState);
  // What the filter controls edit: the person's own filter and sort, WITHOUT
  // quick filter picks. A pick is a chip of its own; written into the
  // filters by an edit, it would stay after the chip is cleared (code
  // review). Save for everyone does take the picks (FR-014), on purpose.
  const ownFilterSort = sharedView ? mergeViewState({ filters: sharedView.filters, sort: sharedView.sort }, personalState) : null;
  // Server-side filter/sort (real Q25): the view's filters/sort become query
  // params so a 50k-row database is filtered in SQLite, not in the browser.
  // Only finished conditions travel. An unfinished one is not "match nothing",
  // it is "not asked yet".
  const isDateProp = (id: string) => (config?.schema ?? []).some((p) => p.id === id && p.type === 'date');
  const serverFilters = (view0?.filters ?? [])
    .filter((f) => filterIsArmed(f, isDateProp(f.property)))
    .map((f) => ({ property: f.property, op: f.op, value: f.value, values: f.values, value2: f.value2 }));
  const serverSort = view0?.sort ?? null;
  // The viewer's day travels with every row query, so "today" resolves
  // against it and not the server's. Part of the key so a tab left open
  // overnight reloads with the new day.
  const todayStr = today();
  // A chart reads the server's counts, not the rows (spec 004): loading every
  // row of a 50k-row database to draw twelve bars would be the slow path the
  // chart exists to avoid. Part of the key, so switching to a table loads them.
  const isChart = view0?.type === 'chart';
  // Nothing is loaded before the views are known: a page load used to fetch
  // every row first and learn only afterwards that the view was a chart.
  const viewKnown = !!view0;
  const fsKey = JSON.stringify([serverFilters, serverSort, todayStr, isChart, viewKnown]);
  // Moves on every reload a chart should follow (rows changed elsewhere, a
  // pull to refresh), standing in for the rows it does not load.
  const [chartEpoch, setChartEpoch] = useState(0);

  // Loads ALL rows, in steps of 200 one after another. It used to stop at the
  // first page plus a "Load more" button — with the result that a board of 656
  // cards showed "Lost / Refunded 0" while 395 sat there: the column was not
  // empty, it was blind. The steps still protect the server (and draw something
  // on screen early); the epoch discards stale answers if the filter or the
  // database changes meanwhile.
  const epochRef = useRef(0);
  const loadRows = useCallback(async () => {
    const epoch = ++epochRef.current;
    if (!viewKnown) return;
    if (isChart) {
      setChartEpoch((n) => n + 1);
      return;
    }
    let acc: Row[] = [];
    for (;;) {
      const res = await api.collectionRows(collectionId, {
        limit: PAGE,
        offset: acc.length,
        filters: serverFilters,
        sort: serverSort,
        today: todayStr,
      });
      if (epoch !== epochRef.current) return; // inzwischen neu geladen
      const mapped: Row[] = res.rows.map((r) => ({
        id: r.id,
        title: r.title,
        icon: r.icon,
        cover: r.cover || '',
        props: r.props || {},
        position: r.position,
        tags: r.tags ?? [],
      }));
      acc = [...acc, ...mapped];
      setTotal(res.total);
      setRows(acc);
      if (acc.length >= res.total || mapped.length === 0) return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, fsKey]);

  // Loads ALL rows — but NOT on every change anywhere in the workspace. This
  // effect used to hang off `pages`, and `pages` gets a new identity on every
  // SSE event: a database with 50k rows then crawled itself completely again
  // after somebody else renamed anything. Now only when the database, the
  // filter or the sorting changes.
  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, fsKey]);

  // Somebody else — a person in another browser, or an agent — moved a row in
  // THIS database. Reload it, so a card that gets pushed to "next" moves while
  // you are looking at it instead of on your next refresh.
  //
  // Only for this database, and debounced: an agent writing a batch of rows
  // sends one event per row, and each full reload walks every page of results.
  useEffect(() => {
    let timer: number | undefined;
    const onRows = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== collectionId) return;
      window.clearTimeout(timer);
      // The schema and the views too: the event also stands for a new
      // property or a changed view, and a tab that kept its first copy of
      // those drew the database as it was when it opened.
      timer = window.setTimeout(() => {
        void loadRows();
        loadConfig();
      }, 400);
    };
    window.addEventListener('nigari:rows', onRows);
    // Somebody pulled down, or pressed sync. Not debounced and not conditional:
    // they asked for THIS table, now.
    const stopRefresh = onRefresh(() => {
      void loadRows();
      loadConfig();
    });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('nigari:rows', onRows);
      stopRefresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, fsKey]);

  useEffect(loadConfig, [loadConfig]);

  const view = view0;
  const schema = config?.schema ?? [];
  // How this view opens its rows (spec 007), handed to every kind of view
  // through RowOpenContext. A form has no rows to open.
  const viewOpenIn = view && view.type !== 'form' ? view.openIn : undefined;
  const rowOpen = useMemo(() => ({ openIn: viewOpenIn, onPeek }), [viewOpenIn, onPeek]);

  // The inner horizontal scroller (the board's columns, the wide table) keeps
  // its position per view, across tab switches and reloads. The vertical
  // scroll belongs to `.page-body` and is remembered beside it (see Editor).
  const rootRef = useRef<HTMLDivElement>(null);
  // Booleans, not the objects: re-run when the view becomes renderable (the
  // config arrives after the mount, and the first rows after that) — but not
  // on every config save or row page, which would yank a scrolled view back.
  // Without this the effect below fires once while the loader is still up
  // (rootRef is empty) and never again, so returning to a tab restores
  // nothing — the position it was asked to remember is still in the store.
  const viewReady = config !== null;
  const rowsArrived = rows.length > 0;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !viewId) return;
    // The view's scroller mounts a render behind the state: retry until it is
    // there and wide enough to take the position, then stop touching it.
    let tries = 30;
    let raf = 0;
    const restore = () => {
      const left = readViewScroll(collectionId, viewId);
      if (!left) return;
      const sc = root.querySelector<HTMLElement>('.board, .table-wrap, .tl-scroll');
      if (sc && sc.scrollWidth > sc.clientWidth) {
        sc.scrollLeft = left;
        return;
      }
      if (--tries > 0) raf = requestAnimationFrame(restore);
    };
    raf = requestAnimationFrame(restore);
    // Scroll events do not bubble, but a capture listener on the root still
    // sees the inner scrollers' — and nothing else scrolls down here.
    //
    // Only user moves are remembered (same anchoring ratchet as the vertical
    // scroll in Editor: late content growth shifts scrollLeft without a
    // gesture, and that shift must not become the remembered position).
    let lastGesture = 0;
    const markGesture = () => {
      lastGesture = Date.now();
    };
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (
        el instanceof HTMLElement &&
        (el.classList.contains('board') || el.classList.contains('table-wrap') || el.classList.contains('tl-scroll'))
      ) {
        if (Date.now() - lastGesture < 2000) writeViewScroll(collectionId, viewId, el.scrollLeft);
      }
    };
    root.addEventListener('scroll', onScroll, { capture: true, passive: true });
    root.addEventListener('wheel', markGesture, { passive: true });
    root.addEventListener('touchmove', markGesture, { passive: true });
    root.addEventListener('pointerdown', markGesture);
    root.addEventListener('keydown', markGesture);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('scroll', onScroll, { capture: true });
      root.removeEventListener('wheel', markGesture);
      root.removeEventListener('touchmove', markGesture);
      root.removeEventListener('pointerdown', markGesture);
      root.removeEventListener('keydown', markGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, viewId, viewReady, rowsArrived]);

  // Only the half that changed goes to the server. Sending both put this tab's
  // copy of the schema back on every view change, and that copy is as old as
  // the tab: a property an agent or a colleague added meanwhile vanished again
  // the moment somebody here resized a column.
  // Answers whether the save went through, so a dialog that saves (the schema
  // editor) can stay open with its edits when it did not.
  const saveConfig = async (next: CollectionConfig): Promise<boolean> => {
    const patch: Partial<CollectionConfig> = {};
    if (!config || next.schema !== config.schema) patch.schema = next.schema;
    if (!config || next.views !== config.views) patch.views = next.views;
    const before = config;
    setConfig(next);
    if (!patch.schema && !patch.views) return true;
    try {
      await api.putCollection(collectionId, patch);
      return true;
    } catch (e) {
      // A refused change (a reader's, or a chart setting the server cannot
      // draw) used to stay on screen as if saved, until the next reload
      // showed otherwise. Put back what is stored and say why (spec 004,
      // FR-027; spec 007's pattern). Every caller fires and forgets, so the
      // refusal ends here.
      if (before) setConfig(before);
      toast((e as Error).message);
      // Somebody locked the views since this tab loaded them (spec 013): the
      // config is reloaded, so the lock shows and its controls go.
      if (e instanceof ApiError && e.code === 'views_locked') loadConfig();
      return false;
    }
  };

  const addRow = async (presetProps?: Record<string, unknown>) => {
    // Deliberately does NOT onNavigate() into the new row: creating an item
    // from a collection view should keep you looking at the collection, same
    // as Notion. Opening it is the same click as any other existing row.
    // No title, like a page made anywhere else: the word "Untitled" is what the
    // interface shows for that, in the reader's language. Stored, it stayed
    // English in every language and turned up in search and exports.
    // In the view the person is looking at (spec 005): the server fills in
    // what its filters pin down, under presetProps (a board column's value).
    const row = await api.createPage(collectionId, '', 'doc', presetProps, undefined, rowViewId(), rowViewScope(), rowViewFilters());
    onPagesChanged();
    announceIfHidden(row);
  };

  // The view a new row is made in. A form has no filters, and its fields are
  // what the person fills in.
  // In a document the view is the embed's own and the server has no such view
  // by id (it lives in the document), so the filters travel instead.
  const rowViewId = () => (!embed && view && view.type !== 'form' ? view.id : undefined);
  // The filters of the embed's view as the person sees it, their own and quick
  // picks included (spec 013, FR-005; spec 014, research R5): the server pins
  // the row's values from them.
  const rowViewFilters = () => (embed && view ? (view.filters ?? []) : undefined);
  const rowViewScope = () => undefined;
  // A row the view's filters still leave out (Estimate > 3, "contains") would
  // vanish without a word; say so and offer the way to it.
  const announceIfHidden = (row: { id: string; matchesView?: boolean }) => {
    if (row.matchesView !== false) return;
    toast(t("The new row doesn't match this view's filters, so it isn't shown here."), {
      label: t('Open'),
      // Opens the way this view opens its rows (spec 007): in its peek, if it
      // has one. There is no click to read modifier keys from.
      run: () => openCollectionRow({}, row.id, { onNavigate, onOpenInNewTab }, { openIn: view?.openIn, onPeek }),
    });
  };

  // Persist an inline change to a select/multiselect property's options (create,
  // recolour, delete) — the cell editor edits the schema, not just the value.
  const setPropOptions = (propId: string, options: PropOption[]) => {
    if (!config) return;
    void saveConfig({
      ...config,
      schema: config.schema.map((p) => (p.id === propId ? { ...p, options } : p)),
    });
  };

  // Several properties of one row in one change: a card dropped into another
  // cell of a board with lanes takes its column and its lane together, so it
  // is never half-moved and the history has one entry (spec 013, R9).
  const setRowProps = async (rowId: string, patch: Record<string, unknown>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, props: { ...r.props, ...patch } } : r)));
    try {
      await api.updatePage(rowId, { propsPatch: patch });
    } catch {
      toast(t('Change not saved'));
    }
  };

  const setRowProp = async (rowId: string, propId: string, value: unknown) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, props: { ...r.props, [propId]: value } } : r)),
    );
    // Send only the changed key (field-level merge) so two devices editing
    // different properties of the same row don't overwrite each other.
    try {
      await api.updatePage(rowId, { propsPatch: { [propId]: value } });
    } catch {
      toast(t('Change not saved'));
    }
  };

  // Setting the group property from a drag/preset respects the property type:
  // a multi-select stores an array, a select stores a scalar.
  // Throwing a row away from the board. Asked for by name, because a card
  // carries no undo affordance of its own and the trash is not visible from
  // here — unlike the sidebar, where you can at least see what vanished.
  //
  // Nothing is destroyed: set_trashed is reversible, and the row list refreshes
  // from the rows event the server sends, so a second screen loses the card too.
  const trashRow = async (id: string, title: string) => {
    const ok = await confirm(
      t('Move “{title}” to the trash?', { title: title || t('Untitled') }),
      { confirmText: t('Move to trash'), danger: true },
    );
    if (!ok) return;
    try {
      await api.trashPage(id);
      await loadRows();
      onPagesChanged();
    } catch (e) {
      toast((e as Error).message || t('Could not be moved to the trash'));
    }
  };

  const setGroupValue = async (rowId: string, propId: string, optId: string) => {
    const prop = schema.find((p) => p.id === propId);
    if (prop?.type === 'multiselect' || prop?.type === 'relation') {
      await setRowProp(rowId, propId, optId === UNSET ? [] : [optId]);
    } else {
      await setRowProp(rowId, propId, optId === UNSET ? '' : optId);
    }
  };

  if (!config || !view) return <div className="editor-loading" />;

  // The views lock (spec 013, viewlock.go on the server). While it is on,
  // nothing that changes the database's views is offered: the server would
  // refuse each with views_locked, and an offer that is refused breaks a
  // promise. What stays: rows, the schema, and in a document the embed's own
  // filters and sort, which belong to the document and not to the views.
  // An embed's views are the document's, not the database's, so the lock (the
  // database's) neither marks nor stops them (spec 014).
  const viewsLock = embed ? null : (config.viewsLocked ?? null);
  const mayChangeViews = embed ? !!embed.canSave : canEdit && !viewsLock;
  // The one place views are saved: the database's through its config, an
  // embed's into the document. openId is the view to open after (a new one, or
  // the first left when the open one is removed).
  const saveViews = (next: ViewDef[], openId?: string) => {
    if (embed) {
      embed.onLocal(encodeEmbedLocal(openId ?? viewId, next));
      return;
    }
    void saveConfig({ ...config, views: next });
    if (openId) {
      setViewId(openId);
      writeViewId(collectionId, openId);
    }
  };
  const setLock = (lock: boolean) =>
    void setViewsLocked(collectionId, lock).then((viewsLocked) => {
      if (viewsLocked !== undefined) setConfig((c) => (c ? { ...c, viewsLocked } : c));
    });

  const updateView = (patch: Partial<ViewDef>) => {
    // A board grouped by the property its lanes are drawn by would be a
    // diagonal, and the server refuses it: choosing that property as the
    // columns takes the lanes away in the same save (code review).
    if (patch.groupBy && patch.groupBy === view.subGroupBy) patch = { ...patch, subGroupBy: '' };
    // A filter or sort edit is the person's own (spec 013, US1): it is kept
    // on their account and changes nothing for anyone else, until they save
    // it for everyone from the bar. On a database's page and in a document.
    if (personalScope && sharedView && ('filters' in patch || 'sort' in patch)) {
      const { filters, sort, ...rest } = patch;
      personal.setState(
        personalScope,
        withPersonalEdit(sharedView, personalState, {
          ...('filters' in patch ? { filters } : {}),
          ...('sort' in patch ? { sort } : {}),
        }),
      );
      if (Object.keys(rest).length === 0) return;
      patch = rest;
    }
    saveViews(views!.map((v) => (v.id === view.id ? { ...v, ...patch } : v)));
  };

  // The bar's two answers to a personal change (spec 013, research R4).
  // Reset: the person's filter and sort go, and they see the shared view.
  const resetPersonal = () => {
    if (personalScope) personal.setState(personalScope, withoutViewChanges(personalState));
  };
  // Save for everyone: what the person sees becomes the view, through the
  // normal save, so the lock, the per-view checks and the activity log
  // apply; only then is the personal state dropped. A refused save keeps it,
  // so nothing the person set is lost. In a document the embed's own filters
  // are written (FR-006a), which belong to the document.
  const maySaveForEveryone = embed ? !!embed.canSave : mayChangeViews;
  const savePersonalForEveryone = async () => {
    if (!personalScope || !sharedView) return;
    // What the person sees, quick filter picks included: a picked chip
    // becomes a shared filter of the view, and the chip is cleared (FR-014).
    const merged = { filters: view.filters ?? [], sort: view.sort ?? null };
    if (embed) {
      saveViews(views!.map((v) => (v.id === sharedView.id ? { ...v, ...merged } : v)));
    } else {
      const ok = await saveConfig({
        ...config,
        views: config.views.map((v) => (v.id === sharedView.id ? { ...v, ...merged } : v)),
      });
      if (!ok) return;
    }
    resetPersonal();
  };

  // A board's lanes (spec 013, US4): drawn when the view has a sub-group
  // whose property still exists. Folding is the person's own; a drop between
  // cells writes both values in one change (setRowProps).
  const laneProp = view.type === 'board' && view.subGroupBy ? schema.find((p) => p.id === view.subGroupBy) : undefined;
  const boardLanes = laneProp
    ? {
        by: laneProp.id,
        prop: laneProp,
        folded: new Set(personalState?.foldedLanes ?? []),
        onFold: personalScope
          ? (lane: string, f: boolean) => personal.setState(personalScope, withFoldedLane(personalState, lane, f))
          : undefined,
        readOnly: laneIsReadOnly(laneProp),
        onDropPatch: (rowId: string, patch: Record<string, unknown>) => void setRowProps(rowId, patch),
      }
    : undefined;

  // Renaming and removing a view. Both were MCP-only: the ＋ made views and
  // nothing took them away, so a board somebody added by accident stayed for
  // good. The Properties dialog had three checkboxes for it, but they worked by
  // TYPE — they could not remove one of two boards, and never offered Table,
  // List, Timeline or Form at all.
  const renameView = async (v: ViewDef) => {
    const name = await promptText(t('Rename view'), { defaultValue: v.name, confirmText: t('Rename') });
    setViewMenuFor(null);
    const n = name?.trim();
    if (!n || n === v.name) return;
    saveViews(views!.map((x) => (x.id === v.id ? { ...x, name: n } : x)));
  };

  // A collection with no view has nothing to render, so the last one stays;
  // so does an embed's.
  const removeView = (v: ViewDef) => {
    setViewMenuFor(null);
    if (views!.length <= 1) return;
    const { views: rest, viewId: open } = removeEmbedView(views!, viewId, v.id);
    saveViews(rest, open !== viewId ? open : undefined);
  };

  // Moving a view along the strip. The ＋ appends and nothing ever moved, so
  // the order a collection ended up with was the order its views happened to be
  // created in — and the one people look at most sat last.
  //
  // Two buttons rather than dragging: a tab strip is a short list, dragging it
  // needs a drop cursor and a touch fallback, and the ⋯ that holds these is
  // already the place the view is renamed and removed. Grey out at the ends
  // instead of hiding, so the pair does not jump around as you shuffle.
  const moveView = (v: ViewDef, delta: -1 | 1) => {
    const next = moveEmbedView(views!, v.id, delta);
    if (next !== views) saveViews(next);
  };

  const addView = (type: ViewDef['type']) => {
    const id = newEmbedViewId(new Set(views!.map((x) => x.id)));
    // A chart starts drawn, grouped by the first select (chartDefaults.ts),
    // never as an empty frame waiting for its first setting.
    const nv: ViewDef = type === 'chart' ? defaultChartView('bar', schema, id, viewTypeLabel(type)) : { id, name: viewTypeLabel(type), type };
    if (type === 'board') nv.groupBy = schema.find((p) => p.type === 'select' || p.type === 'multiselect')?.id;
    if (type === 'calendar') nv.dateProp = schema.find((p) => p.type === 'date')?.id;
    if (type === 'timeline') {
      const dates = schema.filter((p) => p.type === 'date');
      nv.dateProp = dates[0]?.id;
      nv.endDateProp = dates[1]?.id;
    }
    saveViews([...views!, nv], nv.id);
  };

  // A copy of one of the database's views as a view of this embed (spec 014,
  // FR-006/7): its own id and nothing shared with the original, opened at once.
  const addCopy = (dbView: ViewDef) => {
    const copy = copyDatabaseView(dbView, new Set(views!.map((x) => x.id)));
    saveViews([...views!, copy], copy.id);
  };

  const viewRows = applyView(rows, view, schema);
  // Each row's place before the view's sort: how a sort's ties, and a view
  // without one, order the rows. The board's drop marker reads it.
  const rowOrder = view.type === 'board' ? new Map(rows.map((r, i) => [r.id, i])) : undefined;
  const emptyLabel =
    rows.length > 0 && viewRows.length === 0
      ? t('No rows match the current filter.')
      : t('No rows yet. Click ＋ New above.');
  const viewTypeLabel = (vt: ViewDef['type']): string =>
    ({
      table: t('Table'),
      board: t('Board'),
      gallery: t('Gallery'),
      calendar: t('Calendar'),
      timeline: t('Timeline'),
      list: t('List'),
      form: t('Form'),
      chart: t('Chart'),
    })[vt];

  const tabIcon = (t: ViewDef['type']) => {
    const sz = 14;
    if (t === 'board') return <Columns3 size={sz} />;
    if (t === 'gallery') return <LayoutGrid size={sz} />;
    if (t === 'calendar') return <CalendarDays size={sz} />;
    if (t === 'list') return <List size={sz} />;
    if (t === 'form') return <ClipboardList size={sz} />;
    if (t === 'timeline') return <GanttChartSquare size={sz} />;
    if (t === 'chart') return <ChartPie size={sz} />;
    return <Table2 size={sz} />;
  };

  // Columns hidden in this view are dropped from every renderer.
  const hidden = new Set(view.hidden ?? []);
  const visibleSchema = schema.filter((p) => !hidden.has(p.id));
  // A table draws its columns in the view's own order (spec 012): colOrder
  // first, the rest in schema order. Other views keep the schema's.
  const propById = new Map(schema.map((p) => [p.id, p]));
  const tableColumns = orderedColumns(schema.map((p) => p.id), view.colOrder, hidden).map((id) => propById.get(id)!);
  // Relation props that point back at this same collection — candidates for the
  // sub-item (task hierarchy) relation that the table can render as a tree.
  const selfRelProps = schema.filter((p) => p.type === 'relation' && p.relationCollection === collectionId);
  // Date props — the timeline's Start/End pickers choose from these.
  const dateProps = schema.filter((p) => p.type === 'date');

  // A filter that actually narrows the rows (an unfinished one does not).
  const viewFiltered = (view.filters ?? []).some((f) => filterIsArmed(f, isDateProp(f.property)));

  const viewSwitcher = (
    <div className="collection-toolbar">
      <div className="view-tabs">
        {views!.map((v) => (
          <span key={v.id} className="view-tab-wrap">
            <button
              className={'view-tab view-tab--' + v.type + (v.id === view.id ? ' active' : '')}
              onClick={() => pickView(v.id)}
              onDoubleClick={() => {
                if (mayChangeViews) void renameView(v);
              }}
              onContextMenu={(e) => {
                // A reader may not rename, move or remove a view: the server
                // refuses it (in a document, the document is theirs to read
                // only), so offering it only promises what it undoes.
                if (!mayChangeViews) return;
                e.preventDefault();
                tabMenuReturn.current = e.currentTarget;
                // Shift+F10 or the menu key report (0, 0): open under the tab.
                const r = e.currentTarget.getBoundingClientRect();
                setTabMenu({ view: v, point: e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: r.left, y: r.bottom } });
                setTabMenuOpen(true);
              }}
            >
              <span className="view-tab-ic">{tabIcon(v.type)}</span>
              {v.name}
            </button>
          </span>
        ))}
        {mayChangeViews && (
          <AddViewMenu
            // A form collects rows and stays on the database: an embed cannot
            // show one (spec 014).
            types={embed ? ['table', 'board', 'gallery', 'calendar', 'timeline', 'list', 'chart'] : ['table', 'board', 'gallery', 'calendar', 'timeline', 'list', 'form', 'chart']}
            icon={tabIcon}
            label={viewTypeLabel}
            onAdd={addView}
            copy={
              embed
                ? { databaseName: pages.get(collectionId)?.title || t('Untitled'), views: copyableViews(config.views), onCopy: addCopy }
                : undefined
            }
          />
        )}
      </div>
      {/* Beside the tabs, not inside them: on a phone the tab strip scrolls
          and the marker sat off screen at its end (ux audit); there it is
          drawn first instead (styles.css). */}
      {viewsLock && <ViewsLockMarker lock={viewsLock} />}
      <Menu
        label={t('View actions')}
        open={tabMenuOpen}
        anchorPoint={tabMenu?.point ?? null}
        returnFocus={tabMenuReturn}
        onOpenChange={(o) => {
          if (!o) setTabMenuOpen(false);
        }}
      >
        {tabMenu && (
          <ViewActionItems view={tabMenu.view} views={views!} onRename={renameView} onMove={moveView} onRemove={removeView} />
        )}
      </Menu>
      {/* In a document the toolbar's buttons fold away until they are
          reached for (spec 012, US5); a filter or a sort of the view must not
          fold away with them (FR-021), so it is said here, beside the tabs,
          and stays when the buttons are hidden. */}
      {embed && (viewFiltered || view.sort) && (
        <span className="embed-view-state">
          {viewFiltered && <span className="embed-view-state-item">{t('Filtered')}</span>}
          {view.sort && <span className="embed-view-state-item">{t('Sorted')}</span>}
        </span>
      )}
      <div className="collection-actions" data-menu-open={fsOpen || tplOpen ? '' : undefined}>
        {/* Filter and sort stay while the views are locked: they are the
            person's own (spec 013, FR-009). Grouping changes the view for
            everyone, so it goes with the lock. */}
        {view.type !== 'form' && (
          <FilterSortControls
            schema={schema}
            view={ownFilterSort ? { ...view, ...ownFilterSort } : view}
            onChange={updateView}
            onOpenChange={setFsOpen}
            canGroup={!viewsLock}
          />
        )}
        {/* Everything that configures the view and the database, in one menu
            (spec 012, US4): what the Columns popover, the Properties button,
            the ⋯ and the timeline's and sub-items' <select>s did. In a
            document it acts on the embed's own view (spec 014), and its
            database settings only for someone who may write the database. A
            reader is offered nothing to change. */}
        {(embed ? !!embed.canSave : canEdit) && (
          <ViewSettingsMenu
            view={view}
            views={views!}
            schema={schema}
            selfRelProps={selfRelProps}
            dateProps={dateProps}
            open={viewMenuFor === view.id}
            onOpenChange={(o) => setViewMenuFor(o ? view.id : null)}
            onChange={updateView}
            onRename={renameView}
            onMove={moveView}
            onRemove={removeView}
            onEditProperties={() => setSchemaOpen(true)}
            locked={!!viewsLock}
            onLock={() => setLock(true)}
            onUnlock={() => setLock(false)}
            embedded={!!embed}
            canEditDatabase={embed ? embed.canEditDatabase !== false : true}
          />
        )}
        {view.type !== 'form' && (
          <div className="view-menu-wrap split-btn">
            <button className="btn-sm primary" onClick={() => void addRow()}>
              <Plus size={14} /> {t('New')}
            </button>
            <Menu
              label={t('Templates')}
              narrow="sheet"
              open={tplOpen}
              onOpenChange={(o) => (o ? openTemplates() : setTplOpen(false))}
              className="dbt-menu"
              trigger={
                <button className="btn-sm primary split-btn-arrow" title={t('Templates')} aria-label={t('Templates')}>
                  <ChevronDown size={14} />
                </button>
              }
            >
              <MenuLabel>{t('Templates for {name}').replace('{name}', pages.get(collectionId)?.title || t('Untitled'))}</MenuLabel>
              {tpls === null ? (
                <div className="dbt-hint">{t('Loading…')}</div>
              ) : tpls.length === 0 ? (
                <div className="dbt-hint">{t('Create a reusable page template for this database.')}</div>
              ) : (
                <>
                  <MenuItem fn="newPage" onClick={() => void addRow()}>
                    {t('Empty row')}
                  </MenuItem>
                  {/* Each template: click to use it, → or hover for its own
                      actions (MenuValueSubmenu). It used to be a row with a ⋯
                      beside it, which no keyboard could reach inside a menu. */}
                  <MenuValues reason="Templates are values of one function, a new row from the template picked">
                    {tpls.map((p) => (
                      <MenuValueSubmenu
                        key={p.id}
                        icon={<PageIcon icon={p.icon} size={15} fallback={<LayoutTemplate size={15} />} />}
                        label={<span className="dbt-name">{p.title || t('Untitled')}</span>}
                        actionsLabel={t('Template actions')}
                        onClick={() => void addRowFromTemplate(p.id)}
                      >
                        <MenuItem fn="edit" opensDialog onClick={() => (onEditTemplate ?? onNavigate)(p.id)}>
                          {t('Edit')}
                        </MenuItem>
                        {/* These two keep the menu open, so the list reloads in
                            front of you: the copy appears, the trashed one goes. */}
                        <MenuItem fn="duplicate" closeOnClick={false} onClick={() => void duplicateTemplate(p)}>
                          {t('Duplicate')}
                        </MenuItem>
                        <MenuItem fn="moveToTrash" danger closeOnClick={false} onClick={() => void trashTemplate(p)}>
                          {t('Move to trash')}
                        </MenuItem>
                      </MenuValueSubmenu>
                    ))}
                  </MenuValues>
                </>
              )}
              <MenuSeparator />
              <MenuItem fn="newTemplate" opensDialog onClick={() => void newTemplate()}>
                {t('New template')}
              </MenuItem>
            </Menu>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={
        'collection-scroll' +
        (view.type === 'board' ? ' is-board' : '') +
        (embed ? ' is-embed' : '')
      }
    >
      {viewSwitcher}
      {personalScope && sharedView && (
        <QuickFilters
          props={(sharedView.quickFilters ?? [])
            .map((id) => quickFilterProps(schema).find((p) => p.id === id))
            .filter((p): p is NonNullable<typeof p> => !!p)}
          picks={personalState?.quickPicks ?? {}}
          onPick={(prop, value) => personal.setState(personalScope, withQuickPick(personalState, prop, value))}
        />
      )}
      {personalChange && (
        <ViewChangeBar onReset={resetPersonal} onSaveForEveryone={maySaveForEveryone ? () => void savePersonalForEveryone() : undefined} />
      )}
      <RowOpenContext.Provider value={rowOpen}>
      {view.type === 'form' ? (
        <FormView
          collectionId={collectionId}
          schema={visibleSchema}
          view={view}
          onUpdateView={mayChangeViews ? updateView : undefined}
          onSubmitted={onPagesChanged}
        />
      ) : view.type === 'board' ? (
        <BoardView
          rows={viewRows}
          sort={view.sort}
          rowOrder={rowOrder ?? new Map()}
          schema={visibleSchema}
          groupBy={view.groupBy || schema.find((p) => p.type === 'select')?.id || ''}
          tagColors={tagColors}
          commentCounts={commentCounts}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
          onSetProp={setRowProp}
          onSetOptions={setPropOptions}
          onDrop={(rowId, groupBy, optId) => {
            void setGroupValue(rowId, groupBy, optId);
          }}
          onTrashRow={trashRow}
          onAddInColumn={(groupBy, optId, extra) =>
            void addRow({ ...(optId === UNSET ? {} : { [groupBy]: groupValueFor(schema, groupBy, optId) }), ...(extra ?? {}) })
          }
          lanes={boardLanes}
        />
      ) : view.type === 'gallery' ? (
        <GalleryView
          rows={viewRows}
          schema={visibleSchema}
          emptyLabel={emptyLabel}
          tagColors={tagColors}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
          onSetProp={setRowProp}
          onSetOptions={setPropOptions}
        />
      ) : view.type === 'calendar' ? (
        <CalendarView
          rows={viewRows}
          schema={visibleSchema}
          dateProp={view.dateProp || schema.find((p) => p.type === 'date')?.id || ''}
          tagColors={tagColors}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
        />
      ) : view.type === 'chart' ? (
        <Suspense fallback={<div className="db-empty">{t('Loading…')}</div>}>
          {/* One row of its own above the chart: in the toolbar, four labelled
              dropdowns wrapped into a column and stretched every button
              beside them. */}
          <ChartPane
            onChange={updateView}
            canEdit={mayChangeViews}
            onOpenRow={(id) => openCollectionRow({}, id, { onNavigate, onOpenInNewTab }, { openIn: view.openIn, onPeek })}
            collectionId={collectionId}
            view={view}
            schema={schema}
            filters={serverFilters}
            today={todayStr}
            reloadKey={chartEpoch}
            onUpdateView={mayChangeViews ? updateView : undefined}
            tagColors={tagColors}
            onNavigate={onNavigate}
            onOpenInNewTab={onOpenInNewTab}
            onSetProp={setRowProp}
            onSetOptions={setPropOptions}
          />
        </Suspense>
      ) : view.type === 'list' ? (
        <ListView
          rows={viewRows}
          schema={visibleSchema}
          emptyLabel={emptyLabel}
          tagColors={tagColors}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
          onSetProp={setRowProp}
          onSetOptions={setPropOptions}
        />
      ) : view.type === 'timeline' ? (
        <TimelineView
          rows={viewRows}
          schema={visibleSchema}
          startProp={view.dateProp || schema.find((p) => p.type === 'date')?.id || ''}
          endProp={view.endDateProp || ''}
          tagColors={tagColors}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
        />
      ) : (
        <TableView
          rows={viewRows}
          schema={tableColumns}
          emptyLabel={emptyLabel}
          tagColors={tagColors}
          subItemProp={
            view.subItemProp && selfRelProps.some((p) => p.id === view.subItemProp) ? view.subItemProp : undefined
          }
          colWidths={view.colWidths}
          // Widths are the view's too: not offered to a reader, whom the
          // server refuses, nor while the views are locked (spec 013).
          onSetColWidths={mayChangeViews ? (colWidths) => updateView({ colWidths }) : undefined}
          // Moving and hiding a column are this view's own (spec 012): only a
          // table stores an order, and a reader is offered neither. In a
          // document they are the embed's view's own (spec 014), so a column
          // hidden there can be shown again from its Settings.
          onSetColumns={
            mayChangeViews && view.type === 'table'
              ? (visible) => updateView({ colOrder: storedOrder(schema.map((p) => p.id), view.colOrder, visible) })
              : undefined
          }
          onHideColumn={mayChangeViews && view.type === 'table' ? (id) => updateView({ hidden: [...(view.hidden ?? []), id] }) : undefined}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
          onSetProp={setRowProp}
          onSetOptions={setPropOptions}
        />
      )}
      </RowOpenContext.Provider>
      {schemaOpen && (
        <SchemaEditor
          config={config}
          databaseName={pages.get(collectionId)?.title || t('Untitled')}
          titleOf={(id) => pages.get(id)?.title}
          collections={[...pages.values()]
            // A template is a snapshot, not a database rows can point at.
            .filter((p) => p.type === 'collection' && !p.trashed && !p.isTemplate)
            .map((p) => ({ id: p.id, title: p.title }))}
          // From a document the dialog changes the database, and every view of
          // it, everywhere: say so before it is saved (spec 014, FR-012).
          // Cancelling returns to the dialog with the edits kept.
          onSave={
            embed
              ? async (next) => {
                  const ok = await confirm(
                    t('Change the properties of {database}?', { database: pages.get(collectionId)?.title || t('Untitled') }) +
                      '\n' +
                      t('This changes the database and every view of it, everywhere.'),
                    { confirmText: t('Change properties') },
                  );
                  return ok ? saveConfig(next) : false;
                }
              : saveConfig
          }
          onClose={() => setSchemaOpen(false)}
        />
      )}
    </div>
  );
}

// ---- Form view ----
// A Notion-style form: renders the collection's editable properties as fields;
// submitting creates a new row with the entered values. Computed types
// (relation/rollup/formula) can't be filled in and are skipped.
const FORM_TYPES: PropType[] = ['text', 'number', 'select', 'multiselect', 'date', 'checkbox', 'person'];

function FormView({
  collectionId,
  schema,
  view,
  onUpdateView,
  onSubmitted,
}: {
  collectionId: string;
  schema: PropDef[];
  view: ViewDef;
  /** Absent while the views are locked (spec 013): the form's heading and
   *  description are the view's, so they show but cannot be edited. */
  onUpdateView?: (patch: Partial<ViewDef>) => void;
  onSubmitted: () => void;
}) {
  const fields = schema.filter((p) => FORM_TYPES.includes(p.type));
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [shared, setShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    api.formShareStatus(collectionId).then((s) => setShared(s.shared)).catch(() => {});
  }, [collectionId]);

  const doShare = async () => {
    setShareBusy(true);
    try {
      const { url } = await api.createFormShare(collectionId);
      // Backend returns an absolute URL on the external domain when one is
      // configured; only fall back to the current origin for a bare path.
      const full = url.startsWith('http') ? url : window.location.origin + url;
      setShareUrl(full);
      setShared(true);
      try {
        await navigator.clipboard?.writeText(full);
        toast(t('Public link copied'));
      } catch {
        toast(t('Public link created'));
      }
    } catch {
      toast(t('Sharing failed'));
    } finally {
      setShareBusy(false);
    }
  };

  const doUnshare = async () => {
    setShareBusy(true);
    try {
      await api.deleteFormShare(collectionId);
      setShared(false);
      setShareUrl(null);
      toast(t('Public link revoked'));
    } catch {
      toast(t('That did not work'));
    } finally {
      setShareBusy(false);
    }
  };

  const set = (id: string, v: unknown) => setValues((prev) => ({ ...prev, [id]: v }));
  const reset = () => {
    setTitle('');
    setValues({});
    setDone(false);
  };

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const props: Record<string, unknown> = {};
      for (const f of fields) {
        const v = values[f.id];
        if (v === undefined || v === '' || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        props[f.id] = v;
      }
      await api.createPage(collectionId, title.trim(), 'doc', props);
      onSubmitted();
      setDone(true);
    } catch {
      toast(t('Sending failed'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="form-view">
        <div className="form-card form-done">
          <div className="form-done-ic">
            <Check size={30} />
          </div>
          <h2>{t('Sent')}</h2>
          <p>{t('Your answer has been saved.')}</p>
          <button className="btn-sm primary" onClick={reset}>
            {t('Send another answer')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-view">
      <div className="form-card">
        <div className="form-share-bar">
          {!shared ? (
            <button className="btn-sm" disabled={shareBusy} onClick={() => void doShare()}>
              <Share2 size={14} /> {t('Share publicly')}
            </button>
          ) : (
            <>
              <span className="form-share-live">
                <Globe size={13} /> {t('Public')}
              </span>
              <button className="btn-sm" disabled={shareBusy} onClick={() => void doShare()}>
                {t('Copy link')}
              </button>
              <button className="btn-sm" disabled={shareBusy} onClick={() => void doUnshare()}>
                {t('Revoke')}
              </button>
            </>
          )}
        </div>
        {shareUrl && (
          <input
            className="form-share-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
          />
        )}
        <input
          className="form-heading"
          value={view.formTitle ?? ''}
          placeholder={t('Form')}
          readOnly={!onUpdateView}
          onChange={(e) => onUpdateView?.({ formTitle: e.target.value })}
        />
        <textarea
          className="form-desc"
          value={view.formDesc ?? ''}
          placeholder={t('Description (optional): explains what the form is for.')}
          rows={2}
          readOnly={!onUpdateView}
          onChange={(e) => onUpdateView?.({ formDesc: e.target.value })}
        />
        <div className="form-fields">
          <label className="form-field">
            <span className="form-label">
              {t('Title')} <b className="form-req">*</b>
            </span>
            <input
              className="form-input"
              value={title}
              placeholder={t('Name of the entry')}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </label>
          {fields.map((f) => (
            <label key={f.id} className={'form-field' + (f.type === 'checkbox' ? ' form-field--check' : '')}>
              <span className="form-label">{f.name}</span>
              {formField(f, values[f.id], (v) => set(f.id, v))}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn-sm primary form-submit" disabled={busy || !title.trim()} onClick={() => void submit()}>
            <Send size={14} /> {view.formSubmit?.trim() || t('Submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function formField(def: PropDef, value: unknown, onChange: (v: unknown) => void) {
  switch (def.type) {
    case 'number':
      return (
        <input
          className="form-input"
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <input
          className="form-input"
          type="date"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'checkbox':
      return (
        <input
          className="form-checkbox"
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select':
      return (
        <select className="form-input form-select" value={(value as string) || ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
    case 'multiselect': {
      const vals = idList(value);
      if (!def.options?.length) return <span className="form-hint">{t('No options defined')}</span>;
      return (
        <div className="form-chips">
          {def.options.map((o) => {
            const on = vals.includes(o.id);
            return (
              <button
                type="button"
                key={o.id}
                className={'form-chip' + (on ? ' on' : '')}
                onClick={() => onChange(on ? vals.filter((x) => x !== o.id) : [...vals, o.id])}
              >
                {o.name}
              </button>
            );
          })}
        </div>
      );
    }
    case 'text':
    case 'person':
    default:
      return (
        <input className="form-input" value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} />
      );
  }
}

// ---- Filter & sort controls ----

// One date bound of a filter: either a calendar picker or a relative day such
// as today-1M. The toggle only changes how the value is ENTERED — both write
// the same Filter.value string, a YYYY-MM-DD day or a word the server
// resolves anew on every query (see resolveSmartDate in format.ts), so the
// view stays live.
function DateFilterValue({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Exact or relative is a STICKY choice, not derived from the value: clearing
  // the field to type a new word must not fling the picker back to Exact.
  // It only initialises from the value (a stored word reopens as relative)
  // and changes on an explicit toggle click.
  const [relative, setRelative] = useState(
    () => value !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(value),
  );
  // Labels are built during render, never as a module constant: a list
  // resolved once at import keeps its language for the life of the tab.
  const presets: { token: string; label: string }[] = [
    { token: 'today', label: t('Today') },
    { token: 'yesterday', label: t('Yesterday') },
    { token: 'tomorrow', label: t('Tomorrow') },
    { token: 'today-7d', label: t('7 days ago') },
    { token: 'today-30d', label: t('30 days ago') },
    { token: 'today-1M', label: t('A month ago') },
    { token: 'today-3M', label: t('3 months ago') },
    { token: 'today-1Y', label: t('A year ago') },
    { token: 'today+7d', label: t('In 7 days') },
    { token: 'today+1M', label: t('In a month') },
  ];
  const exact = !relative;
  const resolved = resolveSmartDate(value);
  const picked = presets.some((p) => p.token === value) ? value : 'custom';
  return (
    <div className="fs-date">
      <div className="fs-seg">
        <button
          type="button"
          className={exact ? 'on' : ''}
          onClick={() => {
            // Baking the word in: switching to Exact keeps the day the word
            // names today, or clears an already-empty field.
            if (relative) {
              setRelative(false);
              onChange(resolved ?? '');
            }
          }}
        >
          {t('Exact')}
        </button>
        <button
          type="button"
          className={exact ? '' : 'on'}
          onClick={() => {
            if (exact) {
              setRelative(true);
              onChange('today');
            }
          }}
        >
          {t('Relative')}
        </button>
      </div>
      {exact ? (
        <input
          className="prop-input"
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <>
          <select
            className="prop-select"
            value={picked}
            onChange={(e) =>
              onChange(e.target.value === 'custom' ? (picked === 'custom' ? value : 'today') : e.target.value)
            }
          >
            {presets.map((p) => (
              <option key={p.token} value={p.token}>
                {p.label}
              </option>
            ))}
            <option value="custom">{t('Custom…')}</option>
          </select>
          <input
            className="prop-input"
            type="text"
            value={value}
            placeholder="today-1M" // i18n-ok: example token, identical in every language
            onChange={(e) => onChange(e.target.value)}
          />
          {value !== '' &&
            (resolved ? (
              <div className="fs-hint">{t('Resolves to {date}', { date: formatDay(resolved) })}</div>
            ) : isReadableDay(value) ? null : (
              <div className="fs-hint">{t('Unknown relative day. Try today-1M.')}</div>
            ))}
        </>
      )}
    </div>
  );
}

function FilterSortControls({
  schema,
  view,
  onChange,
  onOpenChange,
  canGroup = true,
}: {
  schema: PropDef[];
  view: ViewDef;
  onChange: (patch: Partial<ViewDef>) => void;
  /** A board's grouping is the database's view setting even in a document,
   *  so the views lock takes it away there too (spec 013). */
  canGroup?: boolean;
  /** Whether one of its popovers is open: an embed's folding toolbar stays
   *  shown while it is (spec 012, FR-020). */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState<'filter' | 'sort' | 'group' | null>(null);
  // The cleanup matters: unmounted with a popover open (the view switched to a
  // form, which has no filter controls), it would otherwise leave the embed's
  // toolbar held open and its "Filtered" marker hidden.
  useEffect(() => {
    onOpenChange?.(open !== null);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  const controlsRef = useRef<HTMLDivElement>(null);
  // Titles for every relation in this schema, so a filter on one can offer
  // rows to pick instead of demanding an id. Keyed by property id; the
  // underlying fetch is cached per collection.
  const [relOptions, setRelOptions] = useState<Record<string, RelOption[]>>({});
  useEffect(() => {
    let alive = true;
    for (const p of schema) {
      const target = p.type === 'relation' ? p.relationCollection : p.type === 'backrelation' ? p.backrelationCollection : '';
      if (!target) continue;
      void loadRelationOptions(target).then((o) => {
        if (alive) setRelOptions((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: o }));
      });
    }
    return () => {
      alive = false;
    };
  }, [schema]);
  // Popover position, computed against the viewport. Portaled to <body> so no
  // transformed/overflow-clipping ancestor (the scrollable mobile toolbar, the
  // page-body) can trap or hide it — the bug where the field vanished behind a
  // grey overlay on mobile.
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open || !controlsRef.current) {
      setPos(null);
      return;
    }
    // The one rule for where a toolbar menu goes (anchoredMenu.ts), which the
    // ui/Menu sheets read the breakpoint from too: a copy here drifted from it
    // the moment the breakpoint moved. 340 wide, because a tick list of option
    // names and a pair of date fields need the room.
    setPos(
      anchoredMenuStyle(controlsRef.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, 340, true),
    );
  }, [open]);
  const filters = view.filters ?? [];
  const sort = view.sort ?? null;
  const propName = (id: string) => schema.find((p) => p.id === id)?.name ?? id;

  const valuesFor = (propId: string): { value: string; label: string }[] => {
    const prop = schema.find((p) => p.id === propId);
    if (!prop) return [];
    if (prop.type === 'select' || prop.type === 'multiselect') {
      return (prop.options ?? []).map((o) => ({ value: o.id, label: o.name }));
    }
    if (prop.type === 'checkbox') {
      return [
        { value: 'true', label: 'Checked' },
        { value: 'false', label: 'Unchecked' },
      ];
    }
    // A relation stores page ids. Offering a free-text box here meant filtering
    // "System is nigari" required typing a 32-character id nobody can see —
    // the property was filterable in theory and unusable in practice.
    if (prop.type === 'relation' || prop.type === 'backrelation') {
      return (relOptions[propId] ?? []).map((o) => ({
        value: o.id,
        label: o.title || t('Untitled'),
      }));
    }
    return [];
  };

  // Operators offered per property type. Built during render, never as a module
  // constant: a list of labels resolved once at import keeps its language for
  // the life of the tab. These read `is` / `is not` in a German interface for
  // exactly that reason — they were plain strings, which the checks cannot see
  // inside an object literal.
  const opsFor = (propId: string): { value: FilterOp; label: string }[] => {
    const prop = schema.find((p) => p.id === propId);
    const ty = prop?.type;
    const many = takesSeveral(propId);
    const base: { value: FilterOp; label: string }[] = [
      { value: 'is', label: many ? t('is any of') : t('is') },
      { value: 'is_not', label: many ? t('is none of') : t('is not') },
    ];
    if (ty === 'number' || ty === 'rollup' || ty === 'formula') {
      base.push(
        { value: 'gt', label: t('greater than') },
        { value: 'lt', label: t('less than') },
        { value: 'between', label: t('between') },
      );
    } else if (ty === 'date') {
      base.push(
        { value: 'gt', label: t('after') },
        { value: 'lt', label: t('before') },
        { value: 'between', label: t('between') },
      );
    } else if (ty === 'text' || ty === 'person' || ty === undefined) {
      base.push({ value: 'contains', label: t('contains') });
    }
    base.push({ value: 'is_empty', label: t('is empty') }, { value: 'is_not_empty', label: t('is not empty') });
    return base;
  };

  const hasValueInput = (op: FilterOp | undefined) => op !== 'is_empty' && op !== 'is_not_empty';

  /** Which properties can be asked about with SEVERAL values at once. Only the
   *  ones whose values come from a fixed list — a free-text box has nothing to
   *  tick, and a date uses a range instead. */
  function takesSeveral(propId: string): boolean {
    const ty = schema.find((p) => p.id === propId)?.type;
    return (
      ty === 'select' || ty === 'multiselect' || ty === 'relation' || ty === 'backrelation'
    );
  }

  return (
    <div className="fs-controls" ref={controlsRef}>
      <button
        className={'btn-sm' + (filters.length ? ' active' : '')}
        onClick={() => setOpen(open === 'filter' ? null : 'filter')}
      >
        <FilterIcon size={14} /> Filter{filters.length ? ` (${filters.length})` : ''}
      </button>
      <button
        className={'btn-sm' + (sort ? ' active' : '')}
        onClick={() => setOpen(open === 'sort' ? null : 'sort')}
      >
        <ArrowUpDown size={14} /> {t('Sort')}
      </button>
      {/* Only a board has columns to group into. The setting existed before
          this button did — it just took whatever select property came first,
          which is why nobody could put their tasks into one column per
          project. */}
      {view.type === 'board' && canGroup && (
        <button
          className={'btn-sm' + (view.groupBy ? ' active' : '')}
          onClick={() => setOpen(open === 'group' ? null : 'group')}
        >
          <Columns3 size={14} /> {t('Group')}
        </button>
      )}

      {open && pos && (
        <Portal>
          <div className="fs-backdrop" onClick={() => setOpen(null)} />
          <div className="fs-popover" style={pos}>
            {open === 'filter' && (
              <>
          {filters.map((f, i) => {
            const op = f.op ?? (f.value === '' ? 'is_not_empty' : 'is');
            const options = valuesFor(f.property);
            const patch = (u: Partial<Filter>) => {
              const next = filters.slice();
              next[i] = { ...f, ...u };
              onChange({ filters: next });
            };
            // Keyed by what the condition IS, not where it sits: keying by
            // index moved the Exact/Relative toggle's sticky state onto the
            // wrong row when a filter above was removed. The occurrence count
            // keeps two conditions on the same property apart.
            const occurrence = filters
              .slice(0, i)
              .filter((g) => g.property === f.property && (g.op ?? '') === (f.op ?? '')).length;
            const rowKey = `${f.property}::${f.op ?? ''}::${occurrence}`;
            const propType = schema.find((p) => p.id === f.property)?.type;
            const isDate = propType === 'date';
            const picked = filterValues(f);
            const several = takesSeveral(f.property) && (op === 'is' || op === 'is_not');
            // A tick list writes `values`, everything else writes `value` — the
            // two never travel together, so switching between them clears the
            // other rather than leaving a stale condition behind.
            const toggleValue = (v: string) => {
              const next = picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v];
              patch({ values: next, value: '' });
            };
            return (
              <div key={rowKey} className="fs-filter">
                <div className="fs-filter-head">
                  <span className="fs-label">{propName(f.property)}</span>
                  <select
                    className="prop-select fs-op"
                    value={op}
                    onChange={(e) => {
                      const nextOp = e.target.value as FilterOp;
                      // Changing the operator keeps what still applies and drops
                      // what does not: a range's second date is meaningless under
                      // "after", a tick list under "contains".
                      patch({
                        op: nextOp,
                        value: hasValueInput(nextOp) ? f.value : '',
                        values: takesSeveral(f.property) && (nextOp === 'is' || nextOp === 'is_not') ? f.values : undefined,
                        value2: nextOp === 'between' ? f.value2 : undefined,
                      });
                    }}
                  >
                    {opsFor(f.property).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-btn danger fs-remove"
                    title={t('Remove filter')}
                    onClick={() => onChange({ filters: filters.filter((_, j) => j !== i) })}
                  >
                    ✕
                  </button>
                </div>
                {hasValueInput(op) && (
                  <div className="fs-filter-value">
                    {several && options.length > 0 ? (
                      <div className="fs-checks">
                        {options.map((o) => (
                          <label key={o.value} className={'fs-check' + (picked.includes(o.value) ? ' on' : '')}>
                            <input
                              type="checkbox"
                              checked={picked.includes(o.value)}
                              onChange={() => toggleValue(o.value)}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    ) : op === 'between' ? (
                      isDate ? (
                        <div className="fs-range">
                          <DateFilterValue value={f.value} onChange={(v) => patch({ value: v })} />
                          <span className="fs-range-sep">–</span>
                          <DateFilterValue value={f.value2 ?? ''} onChange={(v) => patch({ value2: v })} />
                        </div>
                      ) : (
                        <div className="fs-range">
                          <input
                            className="prop-input"
                            type="number"
                            value={f.value}
                            onChange={(e) => patch({ value: e.target.value })}
                          />
                          <span className="fs-range-sep">–</span>
                          <input
                            className="prop-input"
                            type="number"
                            value={f.value2 ?? ''}
                            onChange={(e) => patch({ value2: e.target.value })}
                          />
                        </div>
                      )
                    ) : options.length > 0 ? (
                      <select
                        className="prop-select"
                        value={f.value}
                        onChange={(e) => patch({ value: e.target.value, values: undefined })}
                      >
                        <option value="">—</option>
                        {options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : isDate ? (
                      <DateFilterValue value={f.value} onChange={(v) => patch({ value: v, values: undefined })} />
                    ) : (
                      <input
                        className="prop-input"
                        type={propType === 'number' ? 'number' : 'text'}
                        value={f.value}
                        placeholder={t('value')}
                        onChange={(e) => patch({ value: e.target.value, values: undefined })}
                      />
                    )}
                  </div>
                )}
                {/* One hint at a time: a date field that is not a day yet
                    already says so itself (see DateFilterValue). */}
                {!filterIsArmed(f, isDate) &&
                  !(isDate && [f.value ?? '', ...(op === 'between' ? [f.value2 ?? ''] : [])].some((v) => v !== '' && !isReadableDay(v))) && (
                    <div className="fs-hint">{t('Not filtering yet. Pick a value.')}</div>
                  )}
              </div>
            );
          })}
          <select
            className="prop-select fs-add"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              onChange({ filters: [...filters, { property: e.target.value, op: 'is', value: '' }] });
            }}
          >
            <option value="">{t('+ Add filter…')}</option>
            {schema.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
              </>
            )}
            {open === 'sort' && (
              <>
          <div className="fs-row">
            <select
              className="prop-select"
              value={sort?.property ?? ''}
              onChange={(e) =>
                onChange({
                  sort: e.target.value ? { property: e.target.value, dir: sort?.dir ?? 'asc' } : null,
                })
              }
            >
              <option value="">{t('No sort')}</option>
              {schema.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {sort && (
              <select
                className="prop-select"
                value={sort.dir}
                onChange={(e) =>
                  onChange({ sort: { ...sort, dir: e.target.value as Sort['dir'] } })
                }
              >
                <option value="asc">{t('Ascending')}</option>
                <option value="desc">{t('Descending')}</option>
              </select>
            )}
          </div>
              </>
            )}
            {open === 'group' && (
              <div className="fs-row">
                <select
                  className="prop-select"
                  value={view.groupBy ?? ''}
                  onChange={(e) => onChange({ groupBy: e.target.value })}
                >
                  {/* A relation belongs here as much as a select does: "one
                      column per system" is the same question as "one column per
                      status", just answered by another database. */}
                  {schema
                    .filter(
                      (p) =>
                        p.type === 'select' || p.type === 'multiselect' || p.type === 'relation',
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </Portal>
      )}
    </div>
  );
}

// ---- Board (Kanban) ---- lives in BoardView.tsx.

// ---- Table ----

/** The name column's key in colWidths — the title is not a property, so it has
 *  no id of its own. Nothing the interface generates can collide with it: prop
 *  ids are slugged to [a-z0-9-] (see SchemaEditor). An agent writing a schema
 *  over MCP could pick this exact string, since safePropID does allow '_', and
 *  then the two columns would share one width. Cosmetic, and not worth a
 *  guard that would have to be kept in step on both sides. */
const TITLE_COL = '__title';

function TableView({
  rows,
  schema,
  emptyLabel,
  tagColors,
  subItemProp,
  colWidths,
  onSetColWidths,
  onSetColumns,
  onHideColumn,
  onNavigate,
  onOpenInNewTab,
  onSetProp,
  onSetOptions,
}: {
  rows: Row[];
  schema: PropDef[];
  emptyLabel: string;
  tagColors: Record<string, string>;
  subItemProp?: string;
  colWidths?: Record<string, number>;
  /** Absent: the columns cannot be resized (a reader, a locked view). */
  onSetColWidths?: (next: Record<string, number>) => void;
  /** The visible columns in their new order, after a drag or a Move. Absent:
   *  the columns do not move (a reader, a view that is not a table). */
  onSetColumns?: (visible: string[]) => void;
  onHideColumn?: (id: string) => void;
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
  onSetProp: (rowId: string, propId: string, value: unknown) => void;
  onSetOptions: (propId: string, options: PropOption[]) => void;
}) {
  // What a click on a row does follows the view (spec 007, pageOpen.ts).
  const openRow = useOpenRow({ onNavigate, onOpenInNewTab });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // The width being dragged right now. Kept out of the stored widths so the
  // drag is local and instant: writing to the view on every pointermove would
  // put one request per pixel on the wire and re-render the whole table.
  const [drag, setDrag] = useState<{ key: string; px: number } | null>(null);

  // Moving a column (spec 012, US2). The ids drawn, in order; the title is
  // not among them and cannot move.
  const ids = schema.map((p) => p.id);
  const idsKey = ids.join('\u0000');
  const theadRef = useRef<HTMLTableSectionElement>(null);
  // After a Move, focus goes back to the header that moved (FR-005); after
  // Hide in view, to its neighbour. The header is re-rendered in its new
  // place once the order arrives, so this runs after that render.
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    const el = theadRef.current?.querySelector<HTMLElement>(`[data-col-id="${CSS.escape(id)}"] .th-label`);
    el?.focus();
  }, [idsKey]);
  const setColumns = (next: string[], focus: string) => {
    if (!onSetColumns || next.join('\u0000') === idsKey) return;
    focusAfter.current = focus;
    onSetColumns(next);
  };
  const { drag: colDrag, startDrag: startColDrag, consumeClick: consumeColClick } = useColumnDrag((id, gap) =>
    setColumns(moveToGap(ids, id, gap), id),
  );
  const dragFrom = colDrag ? ids.indexOf(colDrag.id) : -1;
  // The marker sits on the gap the column would go to; the two gaps beside the
  // column itself would change nothing, so they show none.
  const markerGap = colDrag && colDrag.gap !== dragFrom && colDrag.gap !== dragFrom + 1 ? colDrag.gap : -1;
  const headClass = (i: number, id: string) =>
    [
      colDrag?.id === id ? 'is-col-dragged' : '',
      markerGap === i ? 'col-drop-before' : '',
      markerGap === ids.length && i === ids.length - 1 ? 'col-drop-after' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  const widthOf = (key: string) =>
    drag?.key === key ? drag.px : colWidths?.[key];

  // A dragged column is pinned: width alone is a suggestion under auto layout,
  // so the three together are what actually hold it.
  const colStyle = (key: string): React.CSSProperties | undefined => {
    const px = widthOf(key);
    return px ? { width: px, minWidth: px, maxWidth: px } : undefined;
  };

  const startResize = (key: string) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    // Deliberately NOT preventDefault: doing that on a pointerdown cancels the
    // compatibility mouse events behind it, dblclick included — and the
    // double-click that gives a column back to its content silently stopped
    // happening. Text selection is held off with a body class instead.
    const th = e.currentTarget.closest('th');
    const from = th ? th.getBoundingClientRect().width : 160;
    const x0 = e.clientX;
    const widthAt = (clientX: number) => Math.max(64, Math.round(from + clientX - x0));
    document.body.classList.add('is-col-resizing');
    const move = (ev: PointerEvent) => setDrag({ key, px: widthAt(ev.clientX) });
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', stop);
      document.body.classList.remove('is-col-resizing');
      setDrag(null);
    };
    const up = (ev: PointerEvent) => {
      stop();
      const px = widthAt(ev.clientX);
      // A click that moved nothing is not a resize. Without this the two clicks
      // of a double-click each stored the unchanged width first, and the reset
      // behind them had to undo two writes nobody asked for.
      if (px !== colWidths?.[key] && !(px === Math.round(from) && !colWidths?.[key])) {
        onSetColWidths?.({ ...(colWidths ?? {}), [key]: px });
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    // A touch the browser takes over for scrolling ends in pointercancel, not
    // pointerup. Without this the body kept is-col-resizing, and no text could
    // be selected anywhere until a reload.
    document.addEventListener('pointercancel', stop);
  };

  // Double-click gives a column back to the content: the entry is REMOVED
  // rather than set to some computed number, so it goes on adapting as rows
  // change instead of freezing at whatever it happened to be that day.
  const resetCol = (key: string) => () => {
    if (!colWidths?.[key]) return;
    const next = { ...colWidths };
    delete next[key];
    onSetColWidths?.(next);
  };
  const toggleTree = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // When a sub-item (self-relation) prop is active, flatten the rows into a
  // DFS-ordered list carrying each row's tree depth + whether it has children,
  // honouring collapse state. Otherwise every row is a depth-0 leaf. A visited
  // set per branch prevents an accidental relation cycle from looping forever.
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const childIdsOf = (r: Row): string[] =>
    subItemProp && Array.isArray(r.props[subItemProp])
      ? (r.props[subItemProp] as string[]).filter((cid) => rowById.has(cid))
      : [];
  const ordered: { row: Row; depth: number; hasKids: boolean }[] = [];
  if (subItemProp) {
    const childSet = new Set<string>();
    for (const r of rows) for (const cid of childIdsOf(r)) childSet.add(cid);
    const roots = rows.filter((r) => !childSet.has(r.id));
    const visit = (r: Row, depth: number, seen: Set<string>) => {
      const kids = childIdsOf(r);
      ordered.push({ row: r, depth, hasKids: kids.length > 0 });
      if (kids.length && !collapsed.has(r.id)) {
        for (const cid of kids) {
          if (!seen.has(cid)) visit(rowById.get(cid)!, depth + 1, new Set([...seen, r.id]));
        }
      }
    };
    for (const r of roots) visit(r, 0, new Set([r.id]));
  } else {
    for (const r of rows) ordered.push({ row: r, depth: 0, hasKids: false });
  }

  // Per-column footer aggregate: numeric columns (number/rollup/formula) show a
  // sum, everything else a count of filled cells — a lightweight Notion-style
  // calc row so a table gives totals at a glance.
  const footer = (p: PropDef): string => {
    const isNumeric = p.type === 'number' || p.type === 'rollup' || p.type === 'formula';
    if (isNumeric) {
      let sum = 0;
      let any = false;
      for (const r of rows) {
        const n = Number(r.props[p.id]);
        if (r.props[p.id] != null && r.props[p.id] !== '' && !Number.isNaN(n)) {
          sum += n;
          any = true;
        }
      }
      if (!any) return '';
      return 'Σ ' + String(Math.round(sum * 1e6) / 1e6);
    }
    const filled = rows.filter((r) => {
      const v = r.props[p.id];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== '' && v !== null && v !== false;
    }).length;
    return filled ? t('{n} filled', { n: filled }) : '';
  };

  return (
    <div className="table-wrap">
      <table className="db-table">
        <thead ref={theadRef}>
          <tr>
            <th className="db-title-col" style={colStyle(TITLE_COL)}>
              <ColHead
                label={t('Name')}
                onResize={onSetColWidths ? startResize(TITLE_COL) : undefined}
                onReset={resetCol(TITLE_COL)}
              />
            </th>
            {schema.map((p, i) => (
              <th key={p.id} data-col-id={p.id} className={headClass(i, p.id)} style={colStyle(p.id)}>
                <ColHead
                  label={p.name}
                  onResize={onSetColWidths ? startResize(p.id) : undefined}
                  onReset={resetCol(p.id)}
                  moves={
                    onSetColumns && onHideColumn
                      ? {
                          onStartDrag: (e) => startColDrag(e, p.id),
                          consumeClick: () => consumeColClick(p.id),
                          onMoveLeft: i > 0 ? () => setColumns(moveColumn(ids, p.id, -1), p.id) : undefined,
                          onMoveRight: i < ids.length - 1 ? () => setColumns(moveColumn(ids, p.id, 1), p.id) : undefined,
                          onHide: () => {
                            focusAfter.current = ids[i + 1] ?? ids[i - 1] ?? null;
                            onHideColumn(p.id);
                          },
                        }
                      : undefined
                  }
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map(({ row: r, depth, hasKids }) => (
            <tr key={r.id}>
              <td className="db-title-col" style={colStyle(TITLE_COL)}>
                <span className="db-title-inner" style={depth ? { paddingLeft: depth * 20 } : undefined}>
                  {subItemProp ? (
                    hasKids ? (
                      <button
                        className="db-tree-toggle"
                        onClick={() => toggleTree(r.id)}
                        aria-label={collapsed.has(r.id) ? t('Expand') : t('Collapse')}
                      >
                        {collapsed.has(r.id) ? '▸' : '▾'}
                      </button>
                    ) : (
                      <span className="db-tree-spacer" />
                    )
                  ) : null}
                  <button
                    className="db-title-link"
                    onClick={(e) => openRow(e, r.id)}
                    onAuxClick={(e) => openPageAux(e, r.id, { onNavigate, onOpenInNewTab })}
                  >
                    {r.icon && <span className="inline-icon"><PageIcon icon={r.icon} size={14} /> </span>}
                    {r.title || t('Untitled')}
                  </button>
                  {/* Presence was drawn on the board card and nowhere else, so
                      anybody working in the table saw nothing at all — which is
                      most of the time. The mark belongs wherever a row is
                      listed, not only where it happens to be a card. */}
                  <AgentDot pageId={r.id} />
                </span>
                {!!r.tags?.length && (
                  <span className="db-row-tags">
                    {r.tags.map((t) => (
                      <span key={t} className={'row-tag ' + tagColorClass(t, tagColors)}>#{t}</span>
                    ))}
                  </span>
                )}
              </td>
              {schema.map((p) => (
                <td key={p.id} style={colStyle(p.id)}>
                  <PropertyValue
                    def={p}
                    value={r.props[p.id]}
                    onChange={(v) => onSetProp(r.id, p.id, v)}
                    onOptionsChange={(opts) => onSetOptions(p.id, opts)}
                    maxChips={2}
                  />
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={schema.length + 1} className="db-empty">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="db-calc-row">
              {/* German, hard-coded, in an English-first product — and every
                  check read clean. The JSX rule structurally cannot see a
                  string with an expression inside it, and one word without an
                  umlaut is below the line rule's threshold. It was found by
                  reading the code for the wiki. */}
              <td className="db-title-col db-calc-cell">
                {plural(rows.length, '{n} row', '{n} rows')}
              </td>
              {schema.map((p) => (
                <td key={p.id} className="db-calc-cell">
                  {footer(p)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ---- Calendar view ----

const ymd = toDayString;

// ---- Timeline / Gantt view ----
// Rows are positioned on a horizontal day-grid by a start date property, and
// span to an optional end date (else a single-day bar). The title column is
// sticky so it stays visible while the time axis scrolls.
function TimelineView({
  rows,
  schema,
  startProp,
  endProp,
  onNavigate,
  onOpenInNewTab,
}: {
  rows: Row[];
  schema: PropDef[];
  startProp: string;
  endProp: string;
  tagColors: Record<string, string>;
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
}) {
  // What a click on a row does follows the view (spec 007, pageOpen.ts).
  const openRow = useOpenRow({ onNavigate, onOpenInNewTab });
  if (!startProp || !schema.some((p) => p.id === startProp && p.type === 'date')) {
    return (
      <div className="board-empty">
        {t('This timeline needs a {type} property as its start. Open Settings, then Edit properties, to add one.', { type: t('Date') })}
      </div>
    );
  }

  const DAY = 26; // px per day
  const LABELW = 190; // sticky title column width
  const dayNum = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };

  type Item = { row: Row; start: number; end: number };
  const items: Item[] = [];
  for (const r of rows) {
    const sv = r.props[startProp];
    if (typeof sv !== 'string' || !sv) continue;
    const start = dayNum(sv);
    let end = start;
    if (endProp) {
      const ev = r.props[endProp];
      if (typeof ev === 'string' && ev) end = Math.max(start, dayNum(ev));
    }
    items.push({ row: r, start, end });
  }

  if (items.length === 0) {
    return (
      <div className="board-empty">
        {t('No entries with a date yet. Set a start date so they appear on the timeline.')}
      </div>
    );
  }

  const today = dayNum(ymd(new Date()));
  const min = Math.min(today, ...items.map((i) => i.start)) - 3;
  const max = Math.max(today, ...items.map((i) => i.end)) + 4;
  const totalDays = max - min + 1;
  const gridWidth = totalDays * DAY;

  // Month header segments across the visible range.
  const months: { label: string; left: number; width: number }[] = [];
  let cursor = min;
  while (cursor <= max) {
    const d = new Date(cursor * 86400000);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    const nextMonthDay = Math.floor(Date.UTC(y, mo + 1, 1) / 86400000);
    const segEnd = Math.min(nextMonthDay - 1, max);
    months.push({
      label: formatMonth(y, mo, 'short'),
      left: (cursor - min) * DAY,
      width: (segEnd - cursor + 1) * DAY,
    });
    cursor = nextMonthDay;
  }
  const todayLeft = (today - min) * DAY;

  return (
    <div className="timeline">
      <div className="tl-scroll">
        <div className="tl-inner" style={{ width: LABELW + gridWidth }}>
          <div className="tl-header">
            <div className="tl-corner" style={{ width: LABELW }} />
            <div className="tl-months" style={{ width: gridWidth }}>
              {months.map((m, i) => (
                <div key={i} className="tl-month" style={{ left: m.left, width: m.width }}>
                  {m.label}
                </div>
              ))}
              <div className="tl-today-tick" style={{ left: todayLeft }} title={t('Today')} />
            </div>
          </div>
          <div className="tl-body">
            {items.map(({ row, start, end }) => {
              const left = (start - min) * DAY;
              const width = Math.max(DAY - 4, (end - start + 1) * DAY - 4);
              return (
                <div key={row.id} className="tl-row">
                  <div
                    className="tl-label"
                    style={{ width: LABELW }}
                    onClick={(e) => openRow(e, row.id)}
                    onAuxClick={(e) => openPageAux(e, row.id, { onNavigate, onOpenInNewTab })}
                    title={row.title}
                  >
                    {row.icon && (
                      <span className="inline-icon">
                        <PageIcon icon={row.icon} size={14} />
                      </span>
                    )}
                    <span className="tl-label-text">{row.title || t('Untitled')}</span>
                  </div>
                  <div className="tl-track" style={{ width: gridWidth }}>
                    <div className="tl-today-line" style={{ left: todayLeft }} />
                    <div
                      className="tl-bar"
                      style={{ left, width }}
                      onClick={(e) => openRow(e, row.id)}
                      onAuxClick={(e) => openPageAux(e, row.id, { onNavigate, onOpenInNewTab })}
                      title={row.title}
                    >
                      <span className="tl-bar-label">{row.title || t('Untitled')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarView({
  rows,
  schema,
  dateProp,
  tagColors,
  onNavigate,
  onOpenInNewTab,
}: {
  rows: Row[];
  schema: PropDef[];
  dateProp: string;
  tagColors: Record<string, string>;
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
}) {
  // What a click on a row does follows the view (spec 007, pageOpen.ts).
  const openRow = useOpenRow({ onNavigate, onOpenInNewTab });
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  if (!dateProp || !schema.some((p) => p.id === dateProp && p.type === 'date')) {
    return (
      <div className="board-empty">
        {t('This calendar needs a {type} property. Open Settings, then Edit properties, to add one.', { type: t('Date') })}
      </div>
    );
  }

  // Bucket rows by their YYYY-MM-DD date value.
  const byDate = new Map<string, Row[]>();
  for (const r of rows) {
    const v = r.props[dateProp];
    if (typeof v !== 'string' || !v) continue;
    const key = v.slice(0, 10);
    (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(r);
  }

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // Where the week starts is a property of the language, not of the code:
  // Monday across most of Europe, Sunday in the US and Japan, Saturday in much
  // of the Arab world. This used to be hardcoded to Monday.
  const startWeekday = (first.getDay() - firstWeekday() + 7) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const today = ymd(new Date());
  const monthLabel = formatMonth(month.getFullYear(), month.getMonth(), 'long');
  const step = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button className="btn-sm" onClick={() => step(-1)} aria-label={t('Previous month')}>‹</button>
        <span className="calendar-title">{monthLabel}</span>
        <button className="btn-sm" onClick={() => step(1)} aria-label={t('Next month')}>›</button>
        <button className="btn-sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{t('Today')}</button>
      </div>
      <div className="calendar-grid">
        {weekdayNames().map((d) => (
          <div key={d} className="calendar-dow">{d}</div>
        ))}
        {cells.map((d, i) => {
          const key = d ? ymd(d) : '';
          const dayRows = d ? byDate.get(key) ?? [] : [];
          return (
            <div key={i} className={'calendar-cell' + (d ? '' : ' empty') + (key === today ? ' today' : '')}>
              {d && <div className="calendar-daynum">{d.getDate()}</div>}
              {dayRows.map((r) => (
                <button
                  key={r.id}
                  className="calendar-event"
                  onClick={(e) => openRow(e, r.id)}
                  onAuxClick={(e) => openPageAux(e, r.id, { onNavigate, onOpenInNewTab })}
                  title={r.title}
                >
                  {r.icon && <span className="inline-icon"><PageIcon icon={r.icon} size={14} /> </span>}
                  {r.title || t('Untitled')}
                  {!!r.tags?.length && (
                    <span className="cal-event-tags">
                      {r.tags.map((t) => (
                        <span key={t} className={'row-tag ' + tagColorClass(t, tagColors)}>#{t}</span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { Row, Page };
