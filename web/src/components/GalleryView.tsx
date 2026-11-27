import { isOptionType, type PropDef, type PropOption } from '../types';
import PropertyValue from './PropertyValue';
import { tagColorClass } from '../tags';
import { PageIcon } from '../pageIcon';
import { openPageAux, useOpenRow } from '../pageOpen';
import { t } from '../i18n';
import { useState } from 'react';
import { cardImageFor, type CardImage } from '../cardImage';

interface Row {
  id: string;
  title: string;
  icon: string;
  cover: string;
  props: Record<string, unknown>;
  tags?: string[];
  firstImage?: string;
}

// A Gallery view renders rows as a responsive grid of cards, each showing a
// picture, its tags, plus its properties. Select / multi-select properties are
// editable inline (Notion-style colour popover). Where the picture comes from
// is the view's cardImage, decided by cardImageFor (cardImage.ts, spec 028).
export default function GalleryView({
  rows,
  schema,
  imageSchema,
  cardImage,
  emptyLabel,
  tagColors,
  onNavigate,
  onOpenInNewTab,
  onSetProp,
  onSetOptions,
}: {
  rows: Row[];
  schema: PropDef[];
  /** Every property, hidden ones too: a card may take its picture from a
   *  property it does not list. Defaults to schema. */
  imageSchema?: PropDef[];
  /** The view's stored card image choice. */
  cardImage?: string;
  emptyLabel: string;
  tagColors: Record<string, string>;
  onNavigate: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
  /** Absent for someone who may only read the rows: every cell then draws
   *  its read-only face (#1118). */
  onSetProp?: (rowId: string, propId: string, value: unknown) => void;
  onSetOptions: (propId: string, options: PropOption[]) => void;
}) {
  // What a click on a row does follows the view (spec 007, pageOpen.ts).
  const openRow = useOpenRow({ onNavigate, onOpenInNewTab });
  if (rows.length === 0) {
    return <div className="db-empty">{emptyLabel}</div>;
  }
  return (
    <div className="gallery">
      {rows.map((r) => {
        const image = cardImageFor(r, cardImage, imageSchema ?? schema);
        return (
        <div
          key={r.id}
          className="gallery-card"
          onClick={(e) => openRow(e, r.id)}
          onAuxClick={(e) => openPageAux(e, r.id, { onNavigate, onOpenInNewTab })}
        >
          {image.kind !== 'none' && <CardPicture key={image.kind === 'image' ? image.url : image.kind} image={image} />}
          <div className="gallery-body">
            <div className="gallery-title">
              {r.icon && image.kind !== 'icon' ? <span className="inline-icon"><PageIcon icon={r.icon} size={14} /> </span> : null}
              {r.title || t('Untitled')}
            </div>
            {!!r.tags?.length && (
              <div className="db-row-tags card-tags">
                {r.tags.map((tag) => (
                  <span key={tag} className={'row-tag ' + tagColorClass(tag, tagColors)}>
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="gallery-props">
              {schema.map((p) => {
                const v = r.props[p.id];
                const editable = isOptionType(p.type);
                if (!editable && (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)))
                  return null;
                if (editable) {
                  return (
                    <div key={p.id} className="card-prop-edit" onClick={(e) => e.stopPropagation()}>
                      <PropertyValue
                        def={p}
                        value={v}
                        onChange={onSetProp ? (nv) => onSetProp(r.id, p.id, nv) : undefined}
                        onOptionsChange={(opts) => onSetOptions(p.id, opts)}
                      />
                    </div>
                  );
                }
                return <PropertyValue key={p.id} def={p} value={v} readOnly compact />;
              })}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// The card's image area. An image fills it, cropped (FR-008), and loads only
// when it scrolls near (a gallery of 5,000 rows). One that fails to load, a
// file since removed or an address that answers nothing, shows the
// placeholder instead of a broken-image mark (spec 028, edge case).
function CardPicture({ image }: { image: Exclude<CardImage, { kind: 'none' }> }) {
  const [broken, setBroken] = useState(false);
  if (image.kind === 'image' && !broken) {
    return (
      <div className="gallery-cover">
        <img className="gallery-cover-img" src={image.url} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />
      </div>
    );
  }
  if (image.kind === 'gradient') return <div className="gallery-cover" style={{ background: image.css }} />;
  return (
    <div className="gallery-cover">
      <span className="gallery-cover-icon">
        <PageIcon icon={image.kind === 'icon' ? image.icon : ''} size={40} fallback="📄" />
      </span>
    </div>
  );
}

export type { Row as GalleryRow };
