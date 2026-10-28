import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, Trash2, X } from 'lucide-react';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '../src/tokens.css';
import './catalog.css';
import { Button } from '../src/ui/Button';
import { IconButton } from '../src/ui/IconButton';
import { Dialog, DialogClose } from '../src/ui/Dialog';
import { AlertDialog } from '../src/ui/AlertDialog';
import { Field, Input } from '../src/ui/Field';
import { Checkbox } from '../src/ui/Checkbox';
import { Select } from '../src/ui/Select';
import { Switch } from '../src/ui/Switch';
import { SidePanel } from '../src/ui/SidePanel';
import { CenterPanel } from '../src/ui/CenterPanel';
import ChartFigure from '../src/components/ChartFigure';
import type { PropDef, ViewDef } from '../src/types';
import type { AggResult } from '../src/chartLayout';

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
  const [checks, setChecks] = useState({ a: false, b: true });
  const [sw, setSw] = useState({ a: false, b: true });
  const [fruitValue, setFruitValue] = useState('banana');
  const [text, setText] = useState('Filled in');
  const [last, setLast] = useState('');

  const switchTheme = (next: string) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  return (
    <main className="cat">
      <header className="cat-head">
        <h1>salt.md components</h1>
        <div className="cat-theme" role="group" aria-label="Theme">
          <Button size="sm" variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => switchTheme('light')}>
            Light
          </Button>
          <Button size="sm" variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => switchTheme('dark')}>
            Dark
          </Button>
        </div>
        <output className="cat-last" data-testid="last">{last}</output>
      </header>

      <Section id="button" title="Button">
        {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
          <Row key={v} label={v}>
            <Button variant={v} onClick={() => setLast(`button ${v}`)}>
              Save
            </Button>
            <Button variant={v} size="sm">
              Small
            </Button>
            <Button variant={v} disabled onClick={() => setLast(`disabled ${v}`)}>
              Disabled
            </Button>
          </Row>
        ))}
      </Section>

      <Section id="icon-button" title="IconButton">
        <Row label="ghost">
          <IconButton label="Add a page" icon={<Plus />} />
          <IconButton label="Add a page" icon={<Plus />} size="sm" />
          <IconButton label="Add a page" icon={<Plus />} disabled />
        </Row>
        <Row label="secondary, danger">
          <IconButton label="Add a page" icon={<Plus />} variant="secondary" />
          <IconButton label="Delete" icon={<Trash2 />} variant="danger" />
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

      <Section id="dialog" title="Dialog and AlertDialog">
        <Row label="open">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          <Button variant="danger" onClick={() => setAlert(true)}>
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
            <IconButton label="Close" icon={<X size={18} />} onClick={() => setPanel(false)} />
          </div>
          <div className="cat-panel-body">
            <h2>Quarterly review</h2>
            <Field label="Notes">
              <Input defaultValue="The page beside it stays usable." />
            </Field>
          </div>
        </SidePanel>
      )}

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
            <IconButton label="Close" icon={<X size={18} />} onClick={() => setCenter(false)} />
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
              <Button variant="primary" onClick={() => setDialog(false)}>
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
