import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Monitor, Moon, Plus, Sun, Trash2, X } from 'lucide-react';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '../src/tokens.css';
import './catalog.css';
import { Button } from '../src/ui/Button';
import { Dialog, DialogClose } from '../src/ui/Dialog';
import { AlertDialog } from '../src/ui/AlertDialog';
import { Field, Input } from '../src/ui/Field';
import { CellAction } from '../src/ui/CellAction';
import { FileList, type FileListItem } from '../src/ui/FileList';
import { FileDrop, type FileDropUpload } from '../src/ui/FileDrop';
import { Checkbox } from '../src/ui/Checkbox';
import { Select } from '../src/ui/Select';
import { Switch } from '../src/ui/Switch';
import { Tabs } from '../src/ui/Tabs';
import { ToggleGroup } from '../src/ui/ToggleGroup';
import { SidePanel } from '../src/ui/SidePanel';
import { CenterPanel } from '../src/ui/CenterPanel';
import { Popover } from '../src/ui/Popover';
import { Menu, MenuItem, MenuCheckboxItem, MenuSubmenu, MenuValues, MenuValueItem, MenuRadioGroup, MenuRadioItem, MenuLabel, MenuSeparator } from '../src/ui/Menu';
import ChartFigure from '../src/components/ChartFigure';
import type { PropDef, ViewDef } from '../src/types';
import type { AggResult } from '../src/chartLayout';
import primitives from '../tokens/primitives.tokens.json';

// The component catalogue (spec 001, FR-012). Every component in web/src/ui/,
// every state the contract names, on nothing but tokens.css: no styles.css, so
// a component that leans on an old class shows up here as unstyled.
//
// ?theme=dark picks the theme (the test screenshots both); each section is a
// [data-section] the test photographs and runs axe on. Demo text is English
// and untranslated on purpose: this page is never shipped.

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.dataset.font = 'brand';

// Two drawn images for the file sections: data addresses, so the catalogue
// needs no server and its reference shots do not depend on a download.
const swatch = (a: string, b: string) => // token-ok: sample image content, not a look
  'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/></svg>`);
const sampleFiles: FileListItem[] = [
  { url: swatch('#f4a261', '#e76f51'), name: 'site-visit.jpg', image: true }, // token-ok: sample image
  { url: swatch('#2a9d8f', '#264653'), name: 'facade-north.png', image: true }, // token-ok: sample image
  { url: '#quote', name: 'Quote for the roof repairs, spring 2027.pdf', image: false },
  { url: '#plan', name: 'floor-plan.dwg', image: false },
];
const sampleUploads: FileDropUpload[] = [
  { key: 'a', name: 'survey-photos.zip', progress: 0.4 },
  { key: 'b', name: 'drone-video.mov', error: 'The file is larger than 50 MB' },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="cat-section" data-section={id} aria-labelledby={`cat-${id}`}>
      <h2 id={`cat-${id}`}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cat-row">
      <span className="cat-row-label">{label}</span>
      <div className="cat-row-items">{children}</div>
    </div>
  );
}

// Colours (spec 019): the roles components use, then the palettes the roles
// reference, read from the token file so a new palette or step shows up here
// without a change to this page. The catalogue may show palette steps; a
// component may not (check-tokens.mjs counts --palette-* in web/src).
const EMPHASES = ['high', 'medium', 'low', 'link'] as const;
const TONES = ['neutral', 'primary', 'destructive'] as const;

const PALETTES = Object.keys(primitives.palette).filter((k) => !k.startsWith('$'));
const STEPS = Object.keys(primitives.palette.$extensions['io.github.neatlittlemacapps.nigari.steps']).sort((a, b) => Number(a) - Number(b));
const ROLES: [string, string[]][] = [
  ['primary', ['primary', 'primary-hover', 'primary-pressed', 'primary-subtle', 'on-primary']],
  ['destructive', ['destructive', 'destructive-hover', 'destructive-pressed', 'destructive-subtle', 'on-destructive']],
  ['surface', ['surface-default', 'surface-sidebar', 'surface-raised']],
  ['text and lines', ['text-default', 'text-muted', 'border-default', 'border-strong', 'hover', 'active']],
  ['data', Array.from({ length: 12 }, (_, i) => `data-${i + 1}`)],
];

function Swatch({ token, label }: { token: string; label: string }) {
  return (
    <figure className="cat-swatch">
      <span className="cat-swatch-chip" style={{ background: `var(${token})` }} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

const fruit = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'damson', label: 'Damson' },
];

// A chart with sample numbers (spec 004): ChartFigure draws what it is given,
// so every kind can be shown here without a server. Not a ui/ primitive, but
// the one place its canvas, its group buttons and its table are run through
// axe and the keyboard in both themes.
const chartSchema: PropDef[] = [
  {
    id: 'stage',
    name: 'Stage',
    type: 'select',
    options: [
      { id: 'idea', name: 'Idea', color: '#337ea9' },
      { id: 'draft', name: 'Draft', color: '#cb912f' },
      { id: 'review', name: 'Review', color: '#9065b0' },
      { id: 'done', name: 'Done', color: '#448361' },
    ],
  },
];
const chartResult: AggResult = {
  groups: [
    { key: 'idea', label: 'Idea', value: 8, rows: 8 },
    { key: 'draft', label: 'Draft', value: 5, rows: 5 },
    { key: 'review', label: 'Review', value: 3, rows: 3 },
    { key: 'done', label: 'Done', value: 11, rows: 11 },
    { key: '', label: '', value: 2, rows: 2 },
  ],
  leftOut: 0,
  total: 29,
};
const chartView = (chartKind: ViewDef['chartKind'], id: string): ViewDef => ({
  id,
  name: 'Chart',
  type: 'chart',
  chartKind,
  groupBy: 'stage',
  chartStyle: { height: 'small' },
});

function Catalog() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  const [dialog, setDialog] = useState(params.get('open') === 'dialog');
  const [alert, setAlert] = useState(params.get('open') === 'alert');
  const [panel, setPanel] = useState(params.get('open') === 'side-panel');
  const [center, setCenter] = useState(params.get('open') === 'center-panel');
  const [pop, setPop] = useState(params.get('open') === 'popover');
  const [popKind, setPopKind] = useState('bar');
  const [popTable, setPopTable] = useState(false);
  const [menu, setMenu] = useState(params.get('open') === 'menu');
  const [menuFav, setMenuFav] = useState(false);
  const [menuWide, setMenuWide] = useState(true);
  const [menuOpenIn, setMenuOpenIn] = useState('side_peek');
  const [ctxPoint, setCtxPoint] = useState<{ x: number; y: number } | null>(null);
  const [checks, setChecks] = useState({ a: false, b: true });
  const [sw, setSw] = useState({ a: false, b: true });
  const [tab, setTab] = useState<'general' | 'access' | 'email'>('general');
  const [appearance, setAppearance] = useState<'light' | 'system' | 'dark'>('system');
  const [role, setRole] = useState<'viewer' | 'member' | 'admin'>('member');
  const [chips, setChips] = useState<string[]>(['red']);
  const [fruitValue, setFruitValue] = useState('banana');
  const [text, setText] = useState('Filled in');
  const [last, setLast] = useState('');
  const [files, setFiles] = useState<FileListItem[]>(sampleFiles);

  const switchTheme = (next: string) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return (
    <main className="cat">
      <header className="cat-head">
        <h1>nigari components</h1>
        <div className="cat-theme" role="group" aria-label="Theme">
          <Button size="sm" pressed={theme === 'light'} onClick={() => switchTheme('light')}>
            Light
          </Button>
          <Button size="sm" pressed={theme === 'dark'} onClick={() => switchTheme('dark')}>
            Dark
          </Button>
        </div>
        <output className="cat-last" data-testid="last">{last}</output>
      </header>

      <Section id="colours" title="Colours (roles and palettes)">
        {ROLES.map(([group, names]) => (
          <Row key={group} label={group}>
            {names.map((n) => (
              <Swatch key={n} token={`--color-${n}`} label={n} />
            ))}
          </Row>
        ))}
        {PALETTES.map((p) => (
          <Row key={p} label={p}>
            <div className="cat-palette">
              {STEPS.map((step) => (
                <Swatch key={step} token={`--palette-${p}-${step}`} label={step} />
              ))}
            </div>
          </Row>
        ))}
      </Section>

      <Section id="button" title="Button">
        {EMPHASES.flatMap((e) =>
          TONES.map((tone) => (
            <Row key={`${e}-${tone}`} label={`${e} · ${tone}`}>
              <Button emphasis={e} tone={tone} onClick={() => setLast(`button ${e} ${tone}`)}>
                Save
              </Button>
              <Button emphasis={e} tone={tone} size="sm">
                Small
              </Button>
              <Button emphasis={e} tone={tone} icon={<Plus />}>
                Add a page
              </Button>
              {e !== 'link' && (
                <>
                  <Button emphasis={e} tone={tone} icon={tone === 'destructive' ? <Trash2 /> : <Plus />} label={tone === 'destructive' ? 'Delete' : 'Add a page'} />
                  <Button emphasis={e} tone={tone} size="sm" icon={<Plus />} label="Add a page" />
                </>
              )}
              <Button emphasis={e} tone={tone} disabled onClick={() => setLast(`disabled ${e} ${tone}`)}>
                Disabled
              </Button>
            </Row>
          )),
        )}
        {/* The label-centring check of web/tests/catalog.mjs measures these:
            a word with no ascender above the capitals and no descender. */}
        <Row label="label centring">
          <Button emphasis="high" data-testid="centre-md">
            Save
          </Button>
          <Button emphasis="high" size="sm" data-testid="centre-sm">
            Save
          </Button>
        </Row>
        <Row label="pressed">
          <Button pressed onClick={() => setLast('pressed')}>
            Board
          </Button>
          <Button pressed={false}>Table</Button>
          <Button emphasis="low" size="sm" pressed>
            Exact
          </Button>
          <Button emphasis="low" pressed icon={<Plus />} label="Add a page" />
        </Row>
        <Row label="extra small (an action in a cell; 30px on a touch screen)">
          <Button size="xs">Open</Button>
          <Button size="xs" emphasis="low">
            Open
          </Button>
        </Row>
        <Row label="icon only, disabled">
          <Button emphasis="low" icon={<Trash2 />} label="Remove (disabled)" disabled onClick={() => setLast('disabled icon')} />
        </Row>
      </Section>

      <Section id="field" title="Field and Input">
        <Row label="states">
          <Field label="Name">
            <Input placeholder="Placeholder" />
          </Field>
          <Field label="Name" hint="Shown on the sign-in page.">
            <Input value={text} onValueChange={setText} />
          </Field>
          <Field label="Address" error="That is not a URL.">
            <Input defaultValue="not a url" />
          </Field>
          <Field label="Disabled" disabled>
            <Input defaultValue="Read only" />
          </Field>
        </Row>
        <Row label='variant="cell": a value typed in place in a table cell'>
          <table className="cat-table cat-table--md cat-cells">
            <tbody>
              <tr>
                <td className="cat-cell-edit">
                  <Input variant="cell" aria-label="Row title" defaultValue="Onboarding checklist v2" />
                </td>
                <td>Not started</td>
              </tr>
            </tbody>
          </table>
        </Row>
      </Section>

      <Section id="cell-action" title="CellAction">
        <p className="cat-note">
          A small button at a cell's end, over its text (spec 026). It shows while its row is hovered or holds the focus, always
          on a touch screen that cannot hover, always when pinned, and never while the row edits. Point at the first row.
        </p>
        <Row label="hover, pinned, a long name, editing">
          <table className="cat-table cat-table--md cat-cells">
            <tbody>
              <tr data-cell-action-host="">
                <td className="cat-cell-name">
                  <span className="cat-cell-text">Roadmap review</span>
                  <CellAction label="Open Roadmap review" onClick={() => setLast('cell action open')}>
                    Open
                  </CellAction>
                </td>
                <td>In progress</td>
              </tr>
              <tr data-cell-action-host="">
                <td className="cat-cell-name">
                  <span className="cat-cell-text">Launch notes</span>
                  <CellAction label="Close Launch notes" pinned onClick={() => setLast('cell action close')}>
                    Close
                  </CellAction>
                </td>
                <td>Done</td>
              </tr>
              <tr data-cell-action-host="">
                <td className="cat-cell-name">
                  <span className="cat-cell-text">Customer interview with the housing co-op about the spring plans</span>
                  <CellAction label="Open Customer interview" pinned onClick={() => {}}>
                    Open
                  </CellAction>
                </td>
                <td>In progress</td>
              </tr>
              <tr data-cell-action-host="" data-editing="">
                <td className="cat-cell-name cat-cell-edit">
                  <Input variant="cell" aria-label="Row title" defaultValue="Onboarding checklist v2" />
                  <CellAction label="Open Onboarding checklist v2" pinned onClick={() => {}}>
                    Open
                  </CellAction>
                </td>
                <td>Not started</td>
              </tr>
            </tbody>
          </table>
        </Row>
      </Section>

      <Section id="file-list" title="FileList">
        <p className="cat-note">
          The files of one value (spec 028). Compact in a cell or a card, one line then +N; full on a row's page, the name
          opening the file, with Remove and reorder (drag, or ⌘/Ctrl+↑/↓ on a name).
        </p>
        <Row label="compact: images and files, +N, one file">
          <div className="cat-stack">
            <FileList variant="compact" label="Photos" items={sampleFiles} moreLabel={(n) => `+${n}`} />
            <FileList variant="compact" label="Plans" items={sampleFiles.slice(2)} moreLabel={(n) => `+${n}`} />
            <FileList variant="compact" label="Quote" items={sampleFiles.slice(2, 3)} moreLabel={(n) => `+${n}`} />
          </div>
        </Row>
        <Row label="full, editable">
          <div className="cat-stack cat-files">
            <FileList
              variant="full"
              label="Media"
              items={files}
              openLabel={(name) => `Open ${name}`}
              removeLabel={(name) => `Remove ${name}`}
              onRemove={(i) => {
                setFiles(files.filter((_, j) => j !== i));
                setLast('file removed');
              }}
              onMove={(from, to) => {
                const next = [...files];
                next.splice(to, 0, ...next.splice(from, 1));
                setFiles(next);
                setLast(`file moved ${from} to ${to}`);
              }}
            />
          </div>
        </Row>
        <Row label="full, read only">
          <div className="cat-stack cat-files">
            <FileList variant="full" label="Media" items={sampleFiles.slice(0, 2)} openLabel={(name) => `Open ${name}`} />
          </div>
        </Row>
      </Section>

      <Section id="file-drop" title="FileDrop">
        <p className="cat-note">
          Add files (spec 028): the button opens the picker, files dropped on the control land too, and each upload shows its
          progress or the server's refusal.
        </p>
        <Row label="rest, uploading and refused, disabled">
          <div className="cat-stack cat-files">
            <FileDrop label="Add files" dropLabel="Drop files here" progressLabel={(n) => `Uploading ${n}`} onFiles={(f) => setLast(`files ${f.length}`)} />
            <FileDrop label="Add files" dropLabel="Drop files here" progressLabel={(n) => `Uploading ${n}`} uploads={sampleUploads} onDismiss={(k) => setLast(`upload dismissed ${k}`)} dismissLabel={(n) => `Dismiss: ${n}`} onFiles={() => {}} />
            <FileDrop label="Add files" dropLabel="Drop files here" progressLabel={(n) => `Uploading ${n}`} disabled onFiles={() => {}} />
          </div>
        </Row>
      </Section>

      <Section id="checkbox" title="Checkbox">
        <Row label="states">
          <Checkbox label="Unchecked" checked={checks.a} onCheckedChange={(a) => setChecks({ ...checks, a })} />
          <Checkbox
            label="Checked"
            description="page.created"
            checked={checks.b}
            onCheckedChange={(b) => setChecks({ ...checks, b })}
          />
          <Checkbox label="Disabled" checked={false} onCheckedChange={() => {}} disabled />
          <Checkbox label="Disabled, checked" checked onCheckedChange={() => {}} disabled />
        </Row>
      </Section>

      <Section id="select" title="Select">
        <Row label="states">
          <Select label="Fruit" options={fruit} value={fruitValue} onValueChange={setFruitValue} />
          <Select label="Disabled" options={fruit} value="apple" onValueChange={() => {}} disabled />
        </Row>
      </Section>

      <Section id="switch" title="Switch">
        <Row label="states">
          <Switch label="Off" checked={sw.a} onCheckedChange={(a) => setSw({ ...sw, a })} />
          <Switch label="On" checked={sw.b} onCheckedChange={(b) => setSw({ ...sw, b })} />
          <Switch label="Disabled" checked={false} onCheckedChange={() => {}} disabled />
        </Row>
      </Section>

      <Section id="tabs" title="Tabs">
        <Row label="row">
          <Tabs
            label="Settings sections"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'general', label: 'General' },
              { value: 'access', label: 'Access' },
              { value: 'email', label: 'Email', icon: <Plus size={14} /> },
            ]}
          />
        </Row>
        <Row label="disabled tab">
          <Tabs
            label="With a disabled tab"
            value="one"
            onValueChange={() => {}}
            items={[
              { value: 'one', label: 'One' },
              { value: 'two', label: 'Two', disabled: true },
            ]}
          />
        </Row>
      </Section>

      <Section id="toggle-group" title="ToggleGroup">
        <Row label="icons">
          <ToggleGroup
            label="Appearance"
            value={appearance}
            onValueChange={setAppearance}
            items={[
              { value: 'light', label: 'Light', icon: <Sun size={14} />, iconOnly: true },
              { value: 'system', label: 'System', icon: <Monitor size={14} />, iconOnly: true },
              { value: 'dark', label: 'Dark', icon: <Moon size={14} />, iconOnly: true },
            ]}
          />
        </Row>
        <Row label="text">
          <ToggleGroup
            label="Role"
            value={role}
            onValueChange={setRole}
            items={[
              { value: 'viewer', label: 'Viewer' },
              { value: 'member', label: 'Member' },
              { value: 'admin', label: 'Admin', disabled: true, title: 'Only an admin can make admins' },
            ]}
          />
        </Row>
        <Row label="ranked">
          <ToggleGroup
            label="Access"
            value={role}
            onValueChange={setRole}
            items={[
              { value: 'viewer', label: 'Viewer', rank: 'viewer' },
              { value: 'member', label: 'Member', rank: 'member' },
              { value: 'admin', label: 'Admin', rank: 'admin' },
            ]}
          />
        </Row>
        <Row label="multiple">
          <ToggleGroup
            label="Colours"
            multiple
            value={chips}
            onValueChange={setChips}
            items={[
              { value: 'red', label: 'Red' },
              { value: 'green', label: 'Green' },
              { value: 'blue', label: 'Blue' },
            ]}
          />
        </Row>
      </Section>

      <Section id="dialog" title="Dialog and AlertDialog">
        <Row label="open">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          <Button tone="destructive" onClick={() => setAlert(true)}>
            Delete…
          </Button>
        </Row>
      </Section>

      <Section id="side-panel" title="SidePanel">
        <Row label="open">
          <Button onClick={() => setPanel(true)}>Open side panel</Button>
        </Row>
      </Section>

      {panel && (
        <SidePanel label="Row preview" onClose={() => setPanel(false)}>
          <div className="cat-panel-bar">
            <Button emphasis="low" label="Close" icon={<X size={18} />} onClick={() => setPanel(false)} />
          </div>
          <div className="cat-panel-body">
            <h2>Quarterly review</h2>
            <Field label="Notes">
              <Input defaultValue="The page beside it stays usable." />
            </Field>
          </div>
        </SidePanel>
      )}

      <Section id="popover" title="Popover">
        <Row label="open">
          <Popover
            label="Chart settings"
            closeLabel="Close"
            open={pop}
            onOpenChange={setPop}
            trigger={<Button>Chart settings</Button>}
          >
            <div className="cat-popover-body">
              <Select
                label="Chart"
                value={popKind}
                onValueChange={setPopKind}
                options={[
                  { value: 'bar', label: 'Vertical bars' },
                  { value: 'line', label: 'Line' },
                  { value: 'donut', label: 'Donut' },
                ]}
              />
              <Switch label="Show as table" checked={popTable} onCheckedChange={setPopTable} />
            </div>
          </Popover>
        </Row>
      </Section>

      <Section id="menu" title="Menu">
        <Row label="from a button">
          <Menu label="Page actions" open={menu} onOpenChange={setMenu} trigger={<Button>Page actions</Button>}>
            <MenuItem fn="openInNewTab" onClick={() => setLast('Open in new tab')}>Open in new tab</MenuItem>
            <MenuItem fn="favorite" filled={menuFav} onClick={() => setMenuFav(!menuFav)}>
              {menuFav ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
            <MenuItem fn="duplicate" onClick={() => setLast('Duplicate')}>Duplicate</MenuItem>
            <MenuSubmenu fn="moveTo" label="Move to workspace">
              <MenuValues reason="Workspaces are values of one function, moveTo">
                <MenuValueItem onClick={() => setLast('Moved to Design')}>Design</MenuValueItem>
                <MenuValueItem onClick={() => setLast('Moved to Research')}>Research</MenuValueItem>
              </MenuValues>
            </MenuSubmenu>
            <MenuSubmenu fn="openRowsIn" label="Open rows in" value={menuOpenIn === 'side_peek' ? 'Side peek' : 'Full page'}>
              <MenuRadioGroup value={menuOpenIn} onValueChange={setMenuOpenIn}>
                <MenuRadioItem value="full_page">Full page</MenuRadioItem>
                <MenuRadioItem value="side_peek">Side peek</MenuRadioItem>
              </MenuRadioGroup>
            </MenuSubmenu>
            <MenuItem fn="exportMarkdown" disabled>Export Markdown</MenuItem>
            <MenuSeparator />
            <MenuLabel>Appearance</MenuLabel>
            <MenuCheckboxItem fn="fullWidth" checked={menuWide} onCheckedChange={setMenuWide}>Full width</MenuCheckboxItem>
            <MenuRadioGroup label="Open pages in" value={menuOpenIn} onValueChange={setMenuOpenIn}>
              <MenuRadioItem value="full_page">Full page</MenuRadioItem>
              <MenuRadioItem value="side_peek">Side peek</MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuItem fn="moveToTrash" danger chord="⌘⌫" onClick={() => setLast('Move to trash')}>Move to trash</MenuItem>
          </Menu>
        </Row>
        <Row label="right-click">
          <div
            className="cat-context-area"
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxPoint({ x: e.clientX, y: e.clientY });
            }}
          >
            Right-click here
          </div>
          <Menu label="Row actions" open={!!ctxPoint} onOpenChange={(o) => !o && setCtxPoint(null)} anchorPoint={ctxPoint}>
            <MenuItem fn="open" onClick={() => setLast('Open')}>Open</MenuItem>
            <MenuItem fn="moveToTrash" danger onClick={() => setLast('Move to trash')}>Move to trash</MenuItem>
          </Menu>
        </Row>
      </Section>

      <Section id="table-text" title="Table text (spec 012)">
        <p className="cat-note">
          Table cells on the type scale at 14px (--font-size-md), headers as the 12px uppercase label (--font-size-xs). Both
          chosen by the owner, 2026-11-03 (research R1).
        </p>
        {(
          [
            ['14px cells', 'cat-table--md'],
          ] as const
        ).map(([label, cls]) => (
          <Row key={cls} label={label}>
            <table className={'cat-table ' + cls}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Effort</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Write the quarterly review</td>
                  <td>In progress</td>
                  <td>3</td>
                  <td>12 Nov 2026</td>
                </tr>
                <tr>
                  <td>Plan the offsite</td>
                  <td>Not started</td>
                  <td>5</td>
                  <td>3 Dec 2026</td>
                </tr>
              </tbody>
            </table>
          </Row>
        ))}
      </Section>

      <Section id="chart" title="Chart (ChartFigure)">
        <div className="cat-charts">
          {(['bar', 'hbar', 'line', 'donut', 'number'] as const).map((k) => (
            <ChartFigure key={k} view={chartView(k, 'cat-' + k)} schema={chartSchema} result={chartResult} />
          ))}
        </div>
      </Section>

      <Section id="center-panel" title="CenterPanel">
        <Row label="open">
          <Button onClick={() => setCenter(true)}>Open centre panel</Button>
        </Row>
      </Section>

      {center && (
        <CenterPanel label="Focused preview" onClose={() => setCenter(false)}>
          <div className="cat-panel-bar">
            <Button emphasis="low" label="Close" icon={<X size={18} />} onClick={() => setCenter(false)} />
          </div>
          <div className="cat-panel-body">
            <h2>Quarterly review</h2>
            <Field label="Summary">
              <Input defaultValue="The page behind it is dimmed." />
            </Field>
          </div>
        </CenterPanel>
      )}

      {dialog && (
        <Dialog
          title="Workspace settings"
          description="Changes apply to everyone in this workspace."
          onClose={() => setDialog(false)}
          footer={
            <>
              <DialogClose>
                <Button>Cancel</Button>
              </DialogClose>
              <Button emphasis="high" onClick={() => setDialog(false)}>
                Save
              </Button>
            </>
          }
        >
          <Field label="Name">
            <Input defaultValue="Research" />
          </Field>
        </Dialog>
      )}
      {alert && (
        <AlertDialog
          title="Delete this page?"
          description="It moves to the trash for 30 days."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={() => setLast('deleted')}
          onClose={() => setAlert(false)}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Catalog />
  </StrictMode>,
);
