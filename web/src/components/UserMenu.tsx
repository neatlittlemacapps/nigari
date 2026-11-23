import { Button } from '../ui/Button';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { FontPref } from '../App';
import type { AuditEntry, User } from '../types';
import Portal from './Portal';
import { confirm } from '../dialog';
import { toast, toastError } from '../toast';
import { useExclusiveModal } from '../modal';
import { Menu, MenuCheckboxItem, MenuItem, MenuSeparator } from '../ui/Menu';
import { formatMoment } from '../format';
import { t } from '../i18n';
import { Bot, Server, User as UserIcon, Undo2, Keyboard } from 'lucide-react';
import { chordFor } from '../keys';
// Loaded when first opened, not with the app: the instance settings alone are
// over a thousand lines that most people never open, and the main bundle has
// a cap (check-bundle.mjs). Spec 010's menu component needed the room.
const AdminSettingsModal = lazy(() => import('./AdminSettings').then((m) => ({ default: m.AdminSettingsModal })));
const TwoFAModal = lazy(() => import('./AdminSettings').then((m) => ({ default: m.TwoFAModal })));
const CalendarSubModal = lazy(() => import('./AdminSettings').then((m) => ({ default: m.CalendarSubModal })));
const LanguageTimeModal = lazy(() => import('./LanguageTime').then((m) => ({ default: m.LanguageTimeModal })));
const UsersModal = lazy(() => import('./AccountAdmin').then((m) => ({ default: m.UsersModal })));
const TokensModal = lazy(() => import('./AccountAdmin').then((m) => ({ default: m.TokensModal })));
import { RowOpenModal } from './RowOpenSettings';

export function Avatar({ user, size = 22 }: { user: User; size?: number }) {
  // With an uploaded picture the circle shows the picture, otherwise the
  // initial on the user colour — the same logic everywhere, so a person stays
  // recognisable.
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: user.avatar ? 'transparent' : user.color,
        fontSize: size * 0.5,
      }}
      title={user.name}
    >
      {user.avatar ? (
        <img src={user.avatar} alt="" />
      ) : (
        user.name.trim().charAt(0).toUpperCase() || '?'
      )}
    </span>
  );
}

// The ten colours the server hands out on creation — the same palette to
// choose from yourself.
const USER_COLORS = [
  '#2f7d4f', '#c4554d', '#3b6fb5', '#b58a3b', '#7d4fb0',
  '#3ba0a8', '#b5527e', '#6b8f3b', '#8a6650', '#5560c4',
];

// Profile dialog: name, email, colour, picture, password. The backend has
// long been able to change name, colour and password (PATCH /api/users/{id})
// — there was simply no interface for it anywhere. Changing the email is new
// (W96).
function ProfileModal({
  user,
  onClose,
  onChanged,
  onOpen2FA,
}: {
  user: User;
  onClose: () => void;
  onChanged: (u: User) => void;
  onOpen2FA: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [color, setColor] = useState(user.color);
  const [avatar, setAvatar] = useState(user.avatar);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useExclusiveModal(onClose);

  const emailChanged = email.trim() !== '' && email !== user.email;
  const pwMismatch = pw !== '' && pw !== pw2;
  // The current password is required as soon as password OR email changes —
  // exactly what the server checks too. Without that confirmation, anyone at a
  // session left open could take over the credentials.
  const needsCurrent = pw !== '' || emailChanged;

  const save = async () => {
    if (pwMismatch) {
      toastError(t('The two new passwords do not match'));
      return;
    }
    setBusy(true);
    try {
      const patch: Parameters<typeof api.updateUser>[1] = {};
      if (name.trim() && name !== user.name) patch.name = name.trim();
      if (emailChanged) patch.email = email.trim();
      if (color !== user.color) patch.color = color;
      if (avatar !== user.avatar) patch.avatar = avatar;
      if (pw) patch.password = pw;
      if (needsCurrent) patch.currentPassword = currentPw;
      if (Object.keys(patch).length) {
        const updated = await api.updateUser(user.id, patch);
        onChanged(updated);
      }
      onClose();
      if (pw) toast(t('Password changed, other sessions were signed out'));
    } catch (err) {
      toastError((err as Error).message || t('Saving failed'));
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async (f: File | undefined) => {
    if (!f) return;
    try {
      const url = await api.upload(f);
      setAvatar(url);
    } catch (err) {
      toastError((err as Error).message || t('Upload failed'));
    }
  };

  return (
    <Portal>
      <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="dialog" role="dialog" aria-modal="true" aria-label={t('Profile')}>
          <h2>{t('Profile')}</h2>
          <div className="profile-avatar-row">
            <Avatar user={{ ...user, name, color, avatar }} size={56} />
            <div className="profile-avatar-btns">
              <Button size="sm" onClick={() => fileRef.current?.click()}>{t('Upload picture')}</Button>
              {avatar && (
                <Button size="sm" onClick={() => setAvatar('')}>{t('Remove picture')}</Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void pickAvatar(e.target.files?.[0])}
              />
            </div>
          </div>
          <label className="profile-label">{t('Name')}</label>
          <input className="prop-input profile-input" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="profile-label">{t('Email')}</label>
          <input className="prop-input profile-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="profile-label">{t('Colour')}</label>
          <div className="profile-colors">
            {USER_COLORS.map((c) => (
              <button
                key={c}
                className={'profile-swatch' + (color === c ? ' active' : '')}
                style={{ background: c }}
                title={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <label className="profile-label">{t('New password (blank = unchanged)')}</label>
          <input
            className="prop-input profile-input"
            type="password"
            value={pw}
            autoComplete="new-password"
            placeholder={t('at least 8 characters')}
            onChange={(e) => setPw(e.target.value)}
          />
          {pw !== '' && (
            <>
              <label className="profile-label">{t('Confirm new password')}</label>
              <input
                className={'prop-input profile-input' + (pwMismatch ? ' is-invalid' : '')}
                type="password"
                value={pw2}
                autoComplete="new-password"
                onChange={(e) => setPw2(e.target.value)}
              />
            </>
          )}
          {needsCurrent && (
            <>
              <label className="profile-label">
                {pw ? t('Current password (to confirm)') : t('Current password (needed to change the email)')}
              </label>
              <input
                className="prop-input profile-input"
                type="password"
                value={currentPw}
                autoComplete="current-password"
                placeholder={t('your password right now')}
                onChange={(e) => setCurrentPw(e.target.value)}
              />
            </>
          )}

          <div className="profile-2fa-row">
            <span>{t('Two-factor authentication')}</span>
            <Button size="sm" onClick={onOpen2FA}>{t('Manage')}</Button>
          </div>

          <div className="dialog-actions">
            <Button onClick={onClose}>{t('Cancel')}</Button>
            <Button emphasis="high"
              disabled={
                busy ||
                (!!pw && pw.length < 8) ||
                pwMismatch ||
                (needsCurrent && currentPw === '')
              }
              onClick={() => void save()}
            >
              {t('Save')}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

interface Props {
  user: User;
  onLogout: () => void;
  // After a profile change App writes the new state into the auth state —
  // otherwise the header and presence would show the old name until a reload.
  onUserChanged?: (u: User) => void;
  onOpenAgents?: () => void;
  // Bear-style notes mode (middle notes column). Off = classic tree layout.
  notesMode?: boolean;
  fontPref?: FontPref;
  onSetFont?: (f: FontPref) => void;
  onToggleNotesMode?: () => void;
  // The shortcut sheet was reachable only by pressing "?", and only if you
  // already knew that — so nobody found the shortcuts it lists.
  onOpenShortcuts?: () => void;
}

export default function UserMenu({ user, onLogout, onUserChanged, onOpenAgents, notesMode, onToggleNotesMode, onOpenShortcuts, fontPref = 'brand', onSetFont }: Props) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [modal, setModal] = useState<'users' | 'tokens' | 'activity' | 'twofa' | 'settings' | 'calendar' | 'profile' | 'langtime' | 'rowopen' | null>(null);

  return (
    <div className="user-menu">
      <Menu
        label={t('Account')}
        side="top"
        align="start"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button ref={menuButton} className="user-menu-btn">
            <Avatar user={user} />
            <span className="user-name">{user.name}</span>
          </button>
        }
      >
        {onOpenAgents && (
          <MenuItem fn="connectAgent" opensDialog className="agents-menu-item" onClick={onOpenAgents}>
            <span className="agents-label">Agents &amp; MCP</span>
          </MenuItem>
        )}
        <MenuItem fn="profile" opensDialog onClick={() => setModal('profile')}>
          {t('Profile')}
        </MenuItem>
        <MenuItem fn="apiTokens" opensDialog onClick={() => setModal('tokens')}>
          {t('API tokens')}
        </MenuItem>
        <MenuItem fn="activityLog" opensDialog onClick={() => setModal('activity')}>
          {t('Activity log')}
        </MenuItem>
        <MenuItem fn="subscribeCalendar" opensDialog onClick={() => setModal('calendar')}>
          {t('Subscribe to calendar')}
        </MenuItem>
        <MenuItem fn="twoFactor" opensDialog onClick={() => setModal('twofa')}>
          {t('Two-factor (2FA)')}
        </MenuItem>
        <MenuItem fn="languageAndTime" opensDialog onClick={() => setModal('langtime')}>
          {t('Language and time')}
        </MenuItem>
        {onOpenShortcuts && (
          // The chord comes from the registry, so the menu cannot advertise a key that moved.
          <MenuItem fn="shortcuts" opensDialog chord={chordFor('help.shortcuts')} onClick={onOpenShortcuts}>
            {t('Keyboard shortcuts')}
          </MenuItem>
        )}
        {onToggleNotesMode && (
          <MenuCheckboxItem
            fn="notesMode"
            checked={!!notesMode}
            closeOnClick={false}
            onCheckedChange={() => onToggleNotesMode()}
            title={t('Note list as a middle column (Bear style)')}
          >
            {t('Notes mode')}
          </MenuCheckboxItem>
        )}
        {/* The fonts live inside the program itself and have been the default
            since W107. The switch stays: anyone used to the system font gets
            back with one click, and the choice applies to their account
            alone. */}
        {onSetFont && (
          <MenuCheckboxItem
            fn="fonts"
            checked={fontPref === 'brand'}
            closeOnClick={false}
            onCheckedChange={() => onSetFont(fontPref === 'brand' ? 'system' : 'brand')}
            title={t('Inter for text, JetBrains Mono for code and labels (the fonts from the website)')}
          >
            {t('nigari fonts')}
          </MenuCheckboxItem>
        )}
        {user.isAdmin && (
          <MenuItem fn="manageUsers" opensDialog onClick={() => setModal('users')}>
            {t('Manage users')}
          </MenuItem>
        )}
        {user.isAdmin && (
          <MenuItem fn="instanceSettings" opensDialog onClick={() => setModal('settings')}>
            {t('Instance settings')}
          </MenuItem>
        )}
        <MenuItem fn="openRowsInNewTab" opensDialog onClick={() => setModal('rowopen')}>
          {t('Open rows in new tab')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem fn="signOut" danger onClick={onLogout}>
          {t('Sign out')}
        </MenuItem>
      </Menu>
      {modal === 'profile' && (
        <ProfileModal
          user={user}
          onClose={() => setModal(null)}
          onChanged={(u) => onUserChanged?.(u)}
          // Open 2FA IN PLACE OF the profile, not nested — both use
          // useExclusiveModal and would otherwise fight over Esc.
          onOpen2FA={() => setModal('twofa')}
        />
      )}
      <Suspense fallback={null}>
        {modal === 'users' && <UsersModal me={user} onClose={() => setModal(null)} />}
        {modal === 'tokens' && <TokensModal onClose={() => setModal(null)} />}
      </Suspense>
      {modal === 'activity' && <ActivityModal onClose={() => setModal(null)} />}
      <Suspense fallback={null}>
        {modal === 'twofa' && <TwoFAModal onClose={() => setModal(null)} />}
        {modal === 'calendar' && <CalendarSubModal onClose={() => setModal(null)} />}
        {modal === 'langtime' && <LanguageTimeModal onClose={() => setModal(null)} />}
      </Suspense>
      {modal === 'rowopen' && <RowOpenModal onClose={() => setModal(null)} />}
      {/* The menu item that opened it is gone by then: focus returns to the
          menu's own button. */}
      <Suspense fallback={null}>
        {modal === 'settings' && <AdminSettingsModal onClose={() => setModal(null)} returnFocus={menuButton} />}
      </Suspense>
    </div>
  );
}

export function ActivityModal({ onClose, pageId, pageTitle }: { onClose: () => void; pageId?: string; pageTitle?: string }) {
  useExclusiveModal(onClose);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [done, setDone] = useState(false);
  // "Show me only what an agent did" is the question this log gets asked. Forty
  // rows touched by one agent, scattered between everything else that happened
  // that afternoon, is not something anybody finds by scrolling.
  const [onlyAgents, setOnlyAgents] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    void api.audit(undefined, pageId).then((e) => {
      setEntries(e);
      if (e.length < 50) setDone(true);
    });
  }, [pageId]);
  const loadMore = async () => {
    const oldest = entries[entries.length - 1]?.id;
    if (!oldest) return;
    const more = await api.audit(oldest, pageId).catch(() => []);
    setEntries((prev) => [...prev, ...more]);
    if (more.length < 50) setDone(true);
  };
  const revert = async (id: number) => {
    setBusy(id);
    try {
      const r = await api.revertChange(id);
      if (r.reverted.length === 0) {
        toastError(t('Nothing was taken back: every value has been changed since.'));
      } else if (r.skipped.length > 0) {
        toast(
          t('{n} taken back, {m} left alone because they changed since.')
            .replace('{n}', String(r.reverted.length))
            .replace('{m}', String(r.skipped.length)),
        );
      } else {
        toast(t('Taken back.'));
      }
    } catch {
      toastError(t('That could not be taken back.'));
    } finally {
      setBusy(null);
    }
  };

  // The account and workspace events are the reason this log exists — without
  // wording they sat between the page edits as a raw "disable_user".
  const label: Record<string, string> = {
    create_page: t('created'),
    upgrade: t('upgraded the database'),
    update_page: t('changed'),
    append_markdown: t('added to'),
    // Find-and-replace edits: edit_content from REST, write_content from MCP
    // (all of its modes). Both read as the change they are, not a raw name.
    edit_content: t('changed'),
    write_content: t('changed'),
    trash_page: t('moved to trash'),
    delete_page: t('permanently deleted'),
    upload_file: t('uploaded a file to'),
    disable_user: t('deactivated the account:'),
    enable_user: t('reactivated the account:'),
    delete_user: t('deleted the account:'),
    delete_workspace: t('deleted the workspace:'),
    workspace_handover: t('took over the workspace:'),
    workspace_adopted: t('adopted the ownerless workspace:'),
    transfer_owner: t('handed the instance to:'),
    break_glass: t('took emergency access:'),
    break_glass_revoked: t('ended the emergency access:'),
    // An agent announcing itself. Without these two the log shows the raw
    // action name, which reads like a bug rather than an entry.
    working_on: t('started working on:'),
    working_on_end: t('finished working on:'),
  };
  // A database's views (spec 013, server/viewaudit.go): the entry's page is
  // the database, its detail the view's name ("Old → New" for a rename). Said
  // as a phrase of their own, because "Ada changed Tasks" would not say that
  // it was a view and which one.
  const viewLabel: Record<string, string> = {
    'view.create': t('View created'),
    'view.delete': t('View deleted'),
    'view.rename': t('View renamed'),
    'view.update': t('View changed'),
  };
  // The words before the page link. A view entry names its view itself (the
  // detail), so the detail is not repeated after it when the database has
  // no title left to link; a lock entry's detail is the database's title.
  // The view phrases are sentences of their own, so a comma parts them from
  // the database's name.
  const phrase = (e: AuditEntry): { text: string; namesDetail: boolean; comma: boolean } => {
    if (e.action === 'views.lock') return { text: t('Views locked by {name}', { name: e.actorName }), namesDetail: false, comma: true };
    if (e.action === 'views.unlock') return { text: t('Views unlocked by {name}', { name: e.actorName }), namesDetail: false, comma: true };
    // An edited comment (spec 017): the detail is the comment's id, which
    // means nothing to a reader, so only the page is named.
    if (e.action === 'comment.edit') return { text: `${e.actorName} ${t('edited a comment on')}`, namesDetail: true, comma: false };
    if (viewLabel[e.action]) return { text: `${e.actorName}: ${viewLabel[e.action]} “${e.detail.slice(0, 60)}”`, namesDetail: true, comma: true };
    return { text: `${e.actorName} ${label[e.action] ?? e.action}`, namesDetail: false, comma: false };
  };
  return (
    <Portal>
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog">
        <h2>{pageId && pageTitle ? t('Activity: {page}').replace('{page}', pageTitle) : t('Activity log')}</h2>
        <p className="dialog-hint">
          {pageId
            ? t('Everything that happened to this page (human or agent).')
            : t('The most recent changes, noting whether a human or an agent made them.')}
        </p>
        <label className="audit-filter">
          <input
            type="checkbox"
            checked={onlyAgents}
            onChange={(ev) => setOnlyAgents(ev.target.checked)}
          />
          {t('Only what agents did')}
        </label>
        <div className="user-list">
          {entries
            .filter((e) => !onlyAgents || e.actorType === 'agent')
            .map((e) => {
            // Worked out once per row, not at each of its three uses.
            const said = phrase(e);
            return (
            <div key={e.id} className="user-row">
              <span className={'badge ' + (e.actorType === 'agent' ? 'agent-badge' : '')}>
                {e.actorType === 'agent' ? (
                  <><Bot size={12} /> {t('agent')}</>
                ) : e.actorType === 'system' ? (
                  // The server itself, at start-up: an upgrade step ran (spec 008).
                  <><Server size={12} /> {t('system')}</>
                ) : (
                  <><UserIcon size={12} /> {t('human')}</>
                )}
              </span>
              <span className="user-row-name">
                {said.text}
                {said.comma && e.pageTitle ? ',' : ''}
                {/* The page by NAME, and clickable. The detail used to trail
                    off in a raw id — the difference between a log you can act on
                    and one you can only read. */}
                {e.pageTitle ? (
                  <>
                    {' '}
                    <a
                      href={'/p/' + e.pageId}
                      onClick={(ev) => {
                        ev.preventDefault();
                        onClose();
                        window.location.assign('/p/' + e.pageId);
                      }}
                    >
                      {e.pageTitle}
                    </a>
                  </>
                ) : (
                  e.detail && !said.namesDetail ? ` “${e.detail.slice(0, 60)}”` : ''
                )}
              </span>
              {e.revertible && (
                <Button size="sm"
                  disabled={busy === e.id}
                  title={t('Put back what this changed, unless it has been edited since')}
                  onClick={() => void revert(e.id)}
                >
                  <Undo2 size={13} /> {t('Take back')}
                </Button>
              )}
              {/* Was `createdAt.slice(0, 16)`, which printed the stored UTC
                  string verbatim — two hours off for a reader in Berlin, and
                  further for anyone else. */}
              <span className="user-row-email">{formatMoment(e.createdAt, 'datetime')}</span>
            </div>
            );
          })}
          {entries.length === 0 && <div className="dialog-hint">{t('Nothing has happened yet.')}</div>}
          {!done && entries.length > 0 && (
            <Button size="sm" onClick={() => void loadMore()}>
              {t('Load more…')}
            </Button>
          )}
        </div>
        <Button className="dialog-close" onClick={onClose}>{t('Close')}</Button>
      </div>
    </div>
    </Portal>
  );
}

