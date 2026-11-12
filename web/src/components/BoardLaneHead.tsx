import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NO_VALUE, type Lane } from '../boardLanes';
import { t } from '../i18n';
import type { PropDef } from '../types';
import { IconButton } from '../ui/IconButton';
import { loadMembers, loadRelationOptions } from './PropertyValue';

// A board lane's heading (spec 013, US4): its name, its card count and a
// fold button. Folded lanes are the person's own (personal state,
// foldedLanes), so folding changes nothing for anyone else. In a module of
// its own: CollectionView.tsx is over 1,400 lines (frontend rules).

/** Names for lanes whose ids are not names: people and the rows a relation
 *  points at, through the caches the cells use. Everything else is named by
 *  its option or its own value. */
export function useLaneNames(prop: PropDef | undefined): (lane: Lane) => string {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const type = prop?.type;
  const target = prop?.relationCollection;
  useEffect(() => {
    let alive = true;
    if (type === 'person') {
      void loadMembers().then((m) => alive && setNames(new Map(m.map((x) => [x.userId, x.name]))));
    } else if (type === 'relation' && target) {
      void loadRelationOptions(target).then((o) => alive && setNames(new Map(o.map((x) => [x.id, x.title || t('Untitled')]))));
    } else {
      setNames(new Map());
    }
    return () => {
      alive = false;
    };
  }, [type, target]);
  return (lane) => {
    if (lane.id === NO_VALUE) return t('No {name}', { name: prop?.name ?? '' });
    return names.get(lane.id) ?? lane.name;
  };
}

export default function BoardLaneHead({
  name,
  count,
  folded,
  onFold,
}: {
  name: string;
  count: number;
  folded: boolean;
  /** Absent where folding cannot be kept (an embed without a place). */
  onFold?: (folded: boolean) => void;
}) {
  return (
    <div className="board-lane-head">
      {onFold && (
        <IconButton
          label={folded ? t('Unfold lane') : t('Fold lane')}
          icon={folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          size="sm"
          aria-expanded={!folded}
          onClick={() => onFold(!folded)}
        />
      )}
      <span className="board-lane-name">{name}</span>
      <span className="board-count">{count}</span>
    </div>
  );
}
