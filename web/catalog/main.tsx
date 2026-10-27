import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, Trash2 } from 'lucide-react';
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

function Catalog() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  const [dialog, setDialog] = useState(params.get('open') === 'dialog');
  const [alert, setAlert] = useState(params.get('open') === 'alert');
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
