import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { t } from '../i18n';
import type { PropDef } from '../types';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Menu, MenuValueItem, MenuValues } from '../ui/Menu';
import { loadMembers, loadRelationOptions, type Member, type RelOption } from './PropertyValue';

// The chips above a view that offers quick filters (spec 013, US3, research
// R7). The person who sets the view up chooses which properties get a chip
// (Settings › Quick filters); each viewer's pick is their own, kept on their
// account with the rest of their personal state (viewState.ts), and narrows
// the view for them alone: the pick is added to the filters they see as an
// "is" condition (mergeViewState, on both sides).
//
// Built from ui/Button, ui/IconButton and ui/Menu: a chip is a button that
// opens a menu of values, and a picked chip has a clear button beside it.
// No chip primitive of its own in ui/: nothing here needs a behaviour those
// three do not already have (Tab order, Escape, focus return, the phone
// sheet).

type Value = { value: string; label: string };

/** The values a chip offers, by property type. People and the rows a
 *  relation points at are loaded through the caches the cells use. */
function useValues(prop: PropDef): Value[] {
  const [members, setMembers] = useState<Member[]>([]);
  const [related, setRelated] = useState<RelOption[]>([]);
  useEffect(() => {
    let alive = true;
    if (prop.type === 'person') void loadMembers().then((m) => alive && setMembers(m));
    if (prop.type === 'relation' && prop.relationCollection) {
      void loadRelationOptions(prop.relationCollection).then((o) => alive && setRelated(o));
    }
    return () => {
      alive = false;
    };
  }, [prop.type, prop.relationCollection]);
  switch (prop.type) {
    case 'select':
    case 'multiselect':
      return (prop.options ?? []).map((o) => ({ value: o.id, label: o.name }));
    case 'checkbox':
      return [
        { value: 'true', label: t('Checked') },
        { value: 'false', label: t('Unchecked') },
      ];
    case 'person': {
      const pool = prop.personPool?.length ? new Set(prop.personPool) : null;
      return members.filter((m) => !pool || pool.has(m.userId)).map((m) => ({ value: m.userId, label: m.name }));
    }
    case 'relation':
      return related.map((o) => ({ value: o.id, label: o.title || t('Untitled') }));
    default:
      return [];
  }
}

function Chip({ prop, picked, onPick }: { prop: PropDef; picked: string; onPick: (value: string) => void }) {
  const values = useValues(prop);
  // A picked value that is not (yet) among the loaded ones still reads as
  // something: its raw value, rather than an empty chip.
  const pickedLabel = picked ? (values.find((v) => v.value === picked)?.label ?? picked) : '';
  return (
    <span className="quick-filter" data-picked={picked ? '' : undefined}>
      <Menu
        label={prop.name}
        align="start"
        narrow="sheet"
        trigger={
          <Button variant={picked ? 'primary' : 'secondary'} size="sm" className="quick-filter-chip">
            {picked ? t('{name}: {value}', { name: prop.name, value: pickedLabel }) : prop.name}
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        }
      >
        <MenuValues reason="the values of one property: picking one narrows the view to it">
          {values.map((v) => (
            <MenuValueItem key={v.value} checked={v.value === picked} onClick={() => onPick(v.value === picked ? '' : v.value)}>
              {v.label}
            </MenuValueItem>
          ))}
        </MenuValues>
      </Menu>
      {picked && (
        <IconButton
          label={t('Clear {name}', { name: prop.name })}
          icon={<X size={14} />}
          size="sm"
          className="quick-filter-clear"
          onClick={() => onPick('')}
        />
      )}
    </span>
  );
}

export default function QuickFilters({
  props,
  picks,
  onPick,
}: {
  /** The properties the view offers, in its order, already checked to exist. */
  props: PropDef[];
  picks: Record<string, string>;
  onPick: (prop: string, value: string) => void;
}) {
  if (props.length === 0) return null;
  return (
    <div className="quick-filters" role="group" aria-label={t('Quick filters')}>
      {props.map((p) => (
        <Chip key={p.id} prop={p} picked={picks[p.id] ?? ''} onPick={(v) => onPick(p.id, v)} />
      ))}
    </div>
  );
}
