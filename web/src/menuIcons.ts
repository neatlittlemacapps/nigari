// One icon per function, read by every menu (spec 010).
//
// Each menu used to import its own icons, and nothing could see two menus at
// once: the same bin stood for "Move to trash" (which can be undone) and
// "Remove view" (which cannot), the same clock for "Version history" and
// "Activity log", while "Export Markdown" and "Open in new tab" each had two
// different icons depending on the menu. A person scanning a menu by its
// pictures could not trust them.
//
// So the pairing lives here, once. A menu item names its FUNCTION (the verb,
// not the thing it acts on: owner's answer A, 2026-10-29) and ui/Menu draws
// the icon from this table, so a function cannot show two icons. Two
// functions sharing one icon is refused by web/scripts/check-menu-icons.mjs,
// which also fails when the editor library grows a menu item this file does
// not map. The full table, with the reason for each change, is
// specs/010-menu-icons/data-model.md and research.md R5.

import { createElement, forwardRef } from 'react';
import {
  AlignLeft,
  AppWindow,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bookmark,
  Bot,
  CalendarDays,
  CalendarRange,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  ChevronRight,
  CircleMinus,
  CodeXml,
  Columns2,
  CopyPlus,
  CornerLeftUp,
  CornerUpRight,
  ExternalLink,
  Eye,
  EyeClosed,
  EyeOff,
  File,
  FileCode,
  FileDown,
  FilePlus,
  FolderTree,
  Globe,
  Grid3x3,
  Hash,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  History,
  Image,
  Key,
  Keyboard,
  Languages,
  LayoutTemplate,
  Lightbulb,
  Link,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  ListTree,
  Lock,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  Maximize2,
  MessageSquare,
  MessagesSquare,
  MoveHorizontal,
  Network,
  NotebookText,
  Palette,
  PanelLeft,
  PanelRight,
  PanelTop,
  Paperclip,
  Pencil,
  Pilcrow,
  Plus,
  Printer,
  Quote,
  Rows2,
  Rows3,
  ScanEye,
  ScissorsLineDashed,
  ScrollText,
  SeparatorHorizontal,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Smile,
  SquareDashed,
  SquarePlus,
  Star,
  Table2,
  TableProperties,
  TextCursorInput,
  Trash2,
  Type,
  Upload,
  User,
  Users,
  Video,
  Workflow,
  Zap,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

// Lucide has no "toggle heading" glyph, and a toggle heading is a different
// block from a plain heading, so it may not share the heading's icon
// (research R6). The composite is two glyphs of the same set: a small chevron
// before the heading's own icon.
function toggleHeading(Heading: LucideIcon, name: string): LucideIcon {
  const Composite = forwardRef<SVGSVGElement, LucideProps>(function ToggleHeading({ size = 16, ...rest }, ref) {
    const n = typeof size === 'number' ? size : parseFloat(String(size)) || 16;
    return createElement(
      'span',
      { className: 'menu-icon-composite', style: { display: 'inline-flex', alignItems: 'center' }, 'aria-hidden': true },
      createElement(ChevronRight, { size: Math.round(n * 0.6), strokeWidth: 2.5, 'aria-hidden': true }),
      createElement(Heading, { ref, size: n, ...rest }),
    );
  });
  Composite.displayName = name;
  return Composite as unknown as LucideIcon;
}

const ToggleHeading1 = toggleHeading(Heading1, 'ToggleHeading1');
const ToggleHeading2 = toggleHeading(Heading2, 'ToggleHeading2');
const ToggleHeading3 = toggleHeading(Heading3, 'ToggleHeading3');

export const MENU_ICONS = {
  // Pages and rows
  newPage: FilePlus,
  newCollection: Table2,
  open: Maximize2,
  openInNewTab: ExternalLink,
  favorite: Star,
  duplicate: CopyPlus,
  moveToTopLevel: CornerLeftUp,
  moveTo: CornerUpRight,
  showFiles: Paperclip,
  saveAsTemplate: LayoutTemplate,
  removeTemplateFlag: SquareDashed,
  // A blank template for a database (the templates menu beside New). Not
  // saveAsTemplate: that copies the page you are on.
  newTemplate: SquarePlus,
  edit: Pencil,
  exportMarkdown: FileDown,
  exportHtml: FileCode,
  print: Printer,
  importFile: Upload,
  moveToTrash: Trash2,

  // The page "…"
  description: AlignLeft,
  toComments: MessagesSquare,
  commentsPanel: MessageSquare,
  versionHistory: History,
  visibility: Lock,
  shareToWeb: Globe,
  fullWidth: MoveHorizontal,

  // Views, blocks
  rename: TextCursorInput,
  moveLeft: ArrowLeft,
  moveRight: ArrowRight,
  // A table column's header menu (spec 012): the column leaves this view
  // only; the property and every other view keep it.
  hideInView: EyeOff,
  // A view's Settings menu (spec 012, research R8).
  propertyVisibility: Eye,
  openRowsIn: PanelRight,
  timelineDates: CalendarRange,
  subItems: Network,
  editProperties: Rows3,
  // The views lock (spec 013), under Database settings. Not Lock and
  // LockOpen: Lock is a page's visibility, and the two must not look alike.
  lockViews: LockKeyhole,
  unlockViews: LockKeyholeOpen,
  // A view's quick filters and a board's lanes (spec 013, PR 3).
  quickFilters: Zap,
  subGroup: Rows2,
  // Property visibility's two bulk actions, carried over from the Columns
  // popover the Settings menu replaces.
  showAllProperties: ScanEye,
  hideAllProperties: EyeClosed,
  // Gone from here, not into the trash: Remove view, and the block menu's
  // Delete. Different from moveToTrash on purpose (Clarifications).
  delete: CircleMinus,
  copyLink: Link,

  // Workspaces and the account
  workspaceSettings: Settings2,
  newWorkspace: Plus,
  unattendedWorkspaces: ShieldAlert,
  connectAgent: Bot,
  profile: User,
  apiTokens: Key,
  activityLog: ScrollText,
  subscribeCalendar: CalendarDays,
  twoFactor: ShieldCheck,
  languageAndTime: Languages,
  shortcuts: Keyboard,
  notesMode: NotebookText,
  fonts: Type,
  manageUsers: Users,
  instanceSettings: Server,
  openRowsInNewTab: AppWindow,
  signOut: LogOut,

  // The editor's / menu: the library's blocks
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  heading4: Heading4,
  heading5: Heading5,
  heading6: Heading6,
  toggleHeading1: ToggleHeading1,
  toggleHeading2: ToggleHeading2,
  toggleHeading3: ToggleHeading3,
  quote: Quote,
  toggleList: ListCollapse,
  numberedList: ListOrdered,
  bulletList: List,
  checkList: ListChecks,
  paragraph: Pilcrow,
  codeBlock: CodeXml,
  pageBreak: ScissorsLineDashed,
  table: Grid3x3,
  image: Image,
  video: Video,
  audio: AudioLines,
  file: File,
  emoji: Smile,
  divider: SeparatorHorizontal,

  // The editor's / menu: nigari's own blocks
  diagram: Workflow,
  columns: Columns2,
  callout: Lightbulb,
  bookmark: Bookmark,
  embedCollection: TableProperties,
  tableOfContents: ListTree,
  subPages: FolderTree,
  barChart: ChartColumn,
  horizontalBarChart: ChartBar,
  lineChart: ChartLine,
  donutChart: ChartPie,
  numberChart: Hash,

  // The editor's block menu
  colors: Palette,
  headerRow: PanelTop,
  headerColumn: PanelLeft,
} satisfies Record<string, LucideIcon>;

export type MenuFunction = keyof typeof MENU_ICONS;

/** Every item of BlockNote's / menu, by the key its dictionary uses
 *  (`@blocknote/core/locales`, `slash_menu`). check-menu-icons.mjs compares
 *  this with the installed library, so an upgrade that adds a block fails the
 *  build until it has a function here. */
export const SLASH_FUNCTIONS = {
  heading: 'heading1',
  heading_2: 'heading2',
  heading_3: 'heading3',
  heading_4: 'heading4',
  heading_5: 'heading5',
  heading_6: 'heading6',
  toggle_heading: 'toggleHeading1',
  toggle_heading_2: 'toggleHeading2',
  toggle_heading_3: 'toggleHeading3',
  quote: 'quote',
  toggle_list: 'toggleList',
  numbered_list: 'numberedList',
  bullet_list: 'bulletList',
  check_list: 'checkList',
  paragraph: 'paragraph',
  code_block: 'codeBlock',
  page_break: 'pageBreak',
  table: 'table',
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'file',
  emoji: 'emoji',
  divider: 'divider',
} as const satisfies Record<string, MenuFunction>;

/** The block menu's items, by their `drag_handle` dictionary keys. */
export const DRAG_HANDLE_FUNCTIONS = {
  delete_menuitem: 'delete',
  colors_menuitem: 'colors',
  header_row_menuitem: 'headerRow',
  header_column_menuitem: 'headerColumn',
} as const satisfies Record<string, MenuFunction>;

/** A function's icon at the size every menu uses. Decoration only: the item's
 *  label is what a screen reader reads (FR-010), so the icon is hidden from
 *  it explicitly rather than relying on the library's default. */
export function MenuIcon({ fn, filled, size }: { fn: MenuFunction; filled?: boolean; size?: number }) {
  const Icon = MENU_ICONS[fn];
  return createElement(Icon, {
    className: 'menu-icon',
    size: size ?? 16,
    fill: filled ? 'currentColor' : 'none',
    'aria-hidden': true,
  });
}
