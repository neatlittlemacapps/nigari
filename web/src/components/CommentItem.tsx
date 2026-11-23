import { useRef, useState } from 'react';
import { Check, Pencil, SmilePlus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { toastError } from '../toast';
import type { Comment, CommentVersion } from '../types';
import { formatMoment, formatRelative } from '../format';
import { t } from '../i18n';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';
import { COMMENT_REACTIONS, reactionGlyph, reactionName } from '../commentReactions';
import { initials, nameColor } from '../avatar';

// One comment in the panel (spec 017): its text, which its author can edit in
// place, the "(edited)" mark that opens its earlier versions, and its
// reactions. Moved out of CommentsPanel so the panel stays readable as the
// comment grew three new controls.
//
// Edit sits beside Resolve and Delete rather than behind a ⋯ menu: those are
// the actions people use most on their own comments, and a menu would add a
// click to each (R6). Reactions are a palette in a popover, not a menu: six
// glyphs read as a choice of one, not as a list of commands.

// Grow with what is written. A textarea has no content height of its own, so
// the height is reset to auto first: otherwise scrollHeight keeps reporting
// the height the box already has, and it could only ever get taller, never
// shrink back when text is deleted.
export function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export default function CommentItem({
  comment: c,
  myUserId,
  canWrite,
  onChanged,
}: {
  comment: Comment;
  myUserId: string;
  /** Whether the person may write on the page: resolve, edit and react. */
  canWrite: boolean;
  /** Something about this comment changed on the server: load the list again. */
  onChanged: () => void;
}) {
  const name = c.authorName || t('unknown');
  const mine = c.authorId === myUserId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<CommentVersion[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);

  const startEdit = () => {
    setDraft(c.body);
    setEditing(true);
  };
  // Focus goes back to the Edit button, so a keyboard user is where they
  // started (FR-012).
  const stopEdit = () => {
    setEditing(false);
    requestAnimationFrame(() => editRef.current?.focus());
  };
  const save = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await api.editComment(c.id, text);
      stopEdit();
      onChanged();
    } catch (err) {
      // The draft stays: nothing typed is lost to a refusal.
      toastError((err as Error).message || t('Could not save the comment'));
    } finally {
      setSaving(false);
    }
  };

  const toggleResolve = async () => {
    await api.resolveComment(c.id, !c.resolvedAt).catch(() => {});
    onChanged();
  };
  const remove = async () => {
    await api.deleteComment(c.id).catch(() => {});
    onChanged();
  };
  const react = async (key: string, on: boolean) => {
    setPickerOpen(false);
    try {
      await api.setReaction(c.id, key, on);
    } catch (err) {
      toastError((err as Error).message);
    }
    onChanged();
  };

  return (
    <article className={'cp-item' + (c.resolvedAt ? ' is-resolved' : '')} data-comment-id={c.id}>
      <div className="cp-item-head">
        <span
          className="cp-avatar"
          style={{ background: c.authorAvatar ? 'transparent' : c.authorColor || nameColor(name) }}
        >
          {c.authorAvatar ? <img src={c.authorAvatar} alt="" /> : initials(name)}
        </span>
        <span className="cp-author">{name}</span>
        <time className="cp-time">{formatRelative(c.createdAt)}</time>
        {c.editedAt && (
          // Anyone who reads the page may read what the comment said before
          // (FR-003); fetched when opened, never with the list.
          <Popover
            label={t('Earlier versions')}
            closeLabel={t('Close')}
            className="cp-versions"
            onOpenChange={(open) => {
              if (open)
                void api
                  .commentVersions(c.id)
                  .then(setVersions)
                  .catch(() => setVersions([]));
            }}
            trigger={
              <Button
                emphasis="low"
                size="sm"
                className="cp-edited"
                title={t('Edited {time}', { time: formatMoment(c.editedAt, 'datetime') })}
              >
                {t('(edited)')}
              </Button>
            }
          >
            <h3 className="cp-versions-title">{t('Earlier versions')}</h3>
            {/* Always there and focusable: the popover puts the focus on its
                first focusable element as it opens, before the versions have
                loaded, and it went to the hidden Close button. The list also
                scrolls by keyboard this way. */}
            <ol className="cp-versions-list" tabIndex={0} aria-label={t('Earlier versions')} aria-busy={versions === null}>
              {versions === null ? (
                <li className="cp-versions-empty">{t('Loading…')}</li>
              ) : (
                versions.map((v, i) => (
                  <li key={i}>
                    <time>{t('Until {time}', { time: formatMoment(v.replacedAt, 'datetime') })}</time>
                    <div className="cp-body">{v.body}</div>
                  </li>
                ))
              )}
            </ol>
          </Popover>
        )}
      </div>

      {editing ? (
        <div className="cp-edit">
          <textarea
            value={draft}
            aria-label={t('Edit comment')}
            autoFocus
            ref={(el) => {
              if (el && !el.dataset.grown) {
                el.dataset.grown = '1';
                grow(el);
                el.setSelectionRange(el.value.length, el.value.length);
              }
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              grow(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void save();
              } else if (e.key === 'Escape') {
                // Escape leaves the edit, not the panel or the peek around it.
                e.preventDefault();
                e.stopPropagation();
                stopEdit();
              }
            }}
          />
          <div className="cp-edit-foot">
            <span className="cp-hint">{t('⌘↵ to save')}</span>
            <Button emphasis="low" size="sm" onClick={stopEdit}>
              {t('Cancel')}
            </Button>
            <Button emphasis="high" size="sm" disabled={!draft.trim() || saving} onClick={() => void save()}>
              {t('Save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="cp-body">{c.body}</div>
      )}

      {(c.reactions.length > 0 || canWrite) && (
        <div className="cp-reactions">
          {c.reactions.map((r) => {
            const names = r.users.map((u) => (u.id === myUserId ? t('You') : u.name)).join(', ');
            const label = t('{names} reacted with {reaction}', { names, reaction: reactionName(r.reaction) });
            return (
              <Button
                key={r.reaction}
                emphasis="low"
                size="sm"
                className="cp-chip"
                pressed={r.mine}
                aria-label={label}
                title={label}
                disabled={!canWrite}
                onClick={() => void react(r.reaction, !r.mine)}
              >
                <span aria-hidden="true">{reactionGlyph(r.reaction)}</span>
                <span aria-hidden="true" className="cp-chip-count">{r.count}</span>
              </Button>
            );
          })}
          {canWrite && (
            <Popover
              label={t('Add reaction')}
              closeLabel={t('Close')}
              className="cp-picker"
              align="start"
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              trigger={<Button emphasis="low" label={t('Add reaction')} icon={<SmilePlus size={14} />} size="sm" className="cp-react" />}
            >
              <div
                className="cp-picker-grid"
                role="group"
                // The arrows are the picker's own, as in a menu: without this
                // the page's arrow navigation (nav.ts) takes them first.
                data-nav-skip=""
                aria-label={t('Add reaction')}
                onKeyDown={(e) => {
                  // The arrows move between the six and stay inside the
                  // picker; the page's own arrow handling took the focus out.
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  e.preventDefault();
                  e.stopPropagation();
                  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button')];
                  const at = items.indexOf(document.activeElement as HTMLElement);
                  const next = (at + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus();
                }}
              >
                {COMMENT_REACTIONS.map((r) => {
                  const on = c.reactions.some((x) => x.reaction === r.key && x.mine);
                  return (
                    <Button
                      key={r.key}
                      emphasis="low"
                      size="sm"
                      className="cp-picker-item"
                      pressed={on}
                      aria-label={reactionName(r.key)}
                      title={reactionName(r.key)}
                      onClick={() => void react(r.key, !on)}
                    >
                      {r.glyph}
                    </Button>
                  );
                })}
              </div>
            </Popover>
          )}
        </div>
      )}

      {!editing && (canWrite || mine) && (
        <div className="cp-actions">
          {canWrite && (
            <Button emphasis="low" size="sm" className="cp-act" title={c.resolvedAt ? t('Reopen') : t('Mark as resolved')} onClick={() => void toggleResolve()}>
              <Check size={13} /> {c.resolvedAt ? t('Reopen') : t('Resolved')}
            </Button>
          )}
          {mine && canWrite && (
            <Button ref={editRef} emphasis="low" size="sm" className="cp-act" onClick={startEdit}>
              <Pencil size={13} /> {t('Edit')}
            </Button>
          )}
          {mine && (
            <Button label={t('Delete')} icon={<Trash2 size={13} />} emphasis="low" tone="destructive" size="sm" className="cp-act" onClick={() => void remove()} />
          )}
        </div>
      )}
    </article>
  );
}
