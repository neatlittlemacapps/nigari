// The people and token administration behind the account menu (Users,
// Tokens): loaded when first opened, not with the app, like the instance
// settings (AdminSettings.tsx). Moved out of UserMenu.tsx when the main bundle
// reached its cap (check-bundle.mjs) with spec 022's row handle on top of the
// checkbox column; most people never open these.
import { Button } from '../ui/Button';
import { ToggleGroup } from '../ui/ToggleGroup';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ApiToken, User, Workspace } from '../types';
import Portal from './Portal';
import { confirm, promptText } from '../dialog';
import { toast } from '../toast';
import { useExclusiveModal } from '../modal';
import { formatDay, formatMoment } from '../format';
import { plural, t } from '../i18n';
import { Key, Server, X } from 'lucide-react';
import { Avatar } from './UserMenu';

type WsRef = { id: string; name: string };
type Membership = { userId: string; workspaceId: string; role: string };
// A function, not a constant: a constant resolves t() once at import time and
// then holds that language for good.
const roleOptions = () => [
  { v: 'none' as const, label: t('No access') },
  { v: 'viewer' as const, label: t('Viewer') },
  { v: 'member' as const, label: t('Member') },
  { v: 'admin' as const, label: t('Admin') },
];

// Vollwertige Nutzerverwaltung (W98): links die Liste, rechts das Detail —
// Instanz-Admin-Schalter, Loeschen, und die Workspace-Zugehoerigkeit mit
// Rolle je Workspace direkt umschaltbar. Neue Nutzer bekommen ihre Workspaces
// gleich beim Anlegen zugewiesen.
export function UsersModal({ me, onClose }: { me: User; onClose: () => void }) {
  useExclusiveModal(onClose);
  const [users, setUsers] = useState<User[]>([]);
  const [access, setAccess] = useState<{ workspaces: WsRef[]; memberships: Membership[] }>({
    workspaces: [],
    memberships: [],
  });
  const [selId, setSelId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void api.listUsers().then((u) => {
      setUsers(u);
      setSelId((cur) => cur ?? u[0]?.id ?? null);
    }).catch(() => {});
    void api.accessOverview().then(setAccess).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const roleOf = (userId: string, wsId: string) =>
    access.memberships.find((m) => m.userId === userId && m.workspaceId === wsId)?.role ?? 'none';

  const setRole = async (userId: string, wsId: string, role: string) => {
    setError(null);
    // Optimistisch: die Pille reagiert sofort, der Server bestaetigt.
    setAccess((a) => {
      const rest = a.memberships.filter((m) => !(m.userId === userId && m.workspaceId === wsId));
      return { ...a, memberships: role === 'none' ? rest : [...rest, { userId, workspaceId: wsId, role }] };
    });
    try {
      await api.setMembership(userId, wsId, role);
    } catch (err) {
      setError((err as Error).message);
      load(); // reset to the real state
    }
  };

  // Emergency access: the reason is mandatory, because it is precisely what
  // separates controlled access from a quiet back door.
  const requestBreakGlass = async (wsId: string, wsName: string) => {
    setError(null);
    const reason = await promptText(t('Emergency access to “{name}”: why?', { name: wsName }), {
      placeholder: t('e.g. Legal review ref. …, approved by …'),
    });
    if (!reason?.trim()) return;
    try {
      const res = await api.breakGlass(wsId, reason.trim());
      const until = formatMoment(res.expiresAt, 'time');
      toast(
        t('Read access to “{name}” until {time}. The people in charge have been told.', {
          name: wsName,
          time: until,
        }),
      );
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleAdmin = async (u: User) => {
    setError(null);
    try {
      await api.updateUser(u.id, { isAdmin: !u.isAdmin });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Deactivating is the normal case when someone leaves: sign-in closed,
  // sessions ended — but everything stays attributable and nothing is orphaned.
  const toggleDisabled = async (u: User) => {
    setError(null);
    try {
      await api.setUserDisabled(u.id, !u.disabled);
      toast(
        u.disabled
          ? t('{name} is active again.', { name: u.name })
          : t('{name} has been deactivated.', { name: u.name }),
      );
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Hand the instance on. Afterwards the previous owner is an ordinary admin —
  // hence the long-winded confirmation; the consequence cannot be undone (only
  // the new owner could hand it back).
  const handOver = async (u: User) => {
    setError(null);
    const ok = await confirm(
      t('Hand the instance to {name}?', { name: u.name }) +
        '\n\n' +
        t('{name} becomes owner: emergency access, instance backup, deleting accounts.', {
          name: u.name,
        }) +
        '\n' +
        t('You will be an ordinary admin afterwards and cannot undo this yourself.'),
      { danger: true, confirmText: t('Hand over') },
    );
    if (!ok) return;
    try {
      const r = await api.transferOwner(u.id);
      toast(t('{name} is now the owner of this instance.', { name: r.owner }));
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Deleting shows what hangs off the account first — and offers the export
  // while the content still exists. Before this, the personal space vanished
  // wordlessly along with the account.
  const remove = async (u: User) => {
    setError(null);
    let impact: Awaited<ReturnType<typeof api.deletionImpact>> | null = null;
    try {
      impact = await api.deletionImpact(u.id);
    } catch {
      /* preview unavailable — said explicitly below */
    }
    const lines: string[] = [];
    // With no preview the dialog must NOT look as if everything were harmless:
    // otherwise all that survives of the warning is the reassuring sentence,
    // while the personal space is still deleted beyond recovery.
    if (!impact) {
      lines.push(
        t(
          'The consequences could not be loaded. If this person has a personal space, it will be deleted with all its pages beyond recovery.',
        ),
      );
    }
    // ALL personal spaces, not just the first — the whole list gets deleted.
    // And the member count belongs in there: it says whether the space holds
    // nothing but their own notes.
    for (const p of impact?.personal ?? []) {
      lines.push(
        t('The personal space “{name}” will be deleted too ({pages}).', {
          name: p.name,
          pages: plural(p.pages, '{n} page', '{n} pages'),
        }),
      );
    }
    if (impact?.shared.length) {
      lines.push(
        t('Kept because others work in them: {list}. This person’s private pages there are deleted.', {
          list: impact.shared
            .map((sw) => `“${sw.name}” (${plural(sw.members, '{n} member', '{n} members')})`)
            .join(', '),
        }),
      );
    }
    if (impact?.orphaned.length) {
      lines.push(
        t('Left with nobody in charge: {list}. The owner takes them on.', {
          list: impact.orphaned
            .map((o) => `“${o.name}” (${plural(o.pages, '{n} page', '{n} pages')})`)
            .join(', '),
        }),
      );
    }
    if (impact?.pages) {
      lines.push(
        t('{pages} in shared workspaces stay where they are.', {
          pages: plural(impact.pages, '{n} page', '{n} pages'),
        }),
      );
    }
    lines.push(t('Deactivating is usually enough. Nothing is lost that way.'));
    if (
      !(await confirm(t('Permanently delete {name}?', { name: u.name }) + `\n\n${lines.join('\n')}`, {
        danger: true,
        confirmText: t('Delete'),
      }))
    )
      return;
    try {
      await api.deleteUser(u.id);
      setSelId(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const filtered = users.filter(
    (u) =>
      !query ||
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()),
  );
  const sel = users.find((u) => u.id === selId) ?? null;

  return (
    <Portal>
      <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="dialog users-dialog" role="dialog" aria-modal="true" aria-label={t('Manage users')}>
          <div className="users-head">
            <h2>{t('Manage users')}</h2>
            <Button size="sm" onClick={() => { setInviting(true); setSelId(null); }}>{t('+ User')}</Button>
          </div>
          {error && <div className="login-error">{error}</div>}
          <div className="users-body">
            <aside className="users-list-pane">
              <input
                className="users-search"
                placeholder={t('Search…')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="users-list-scroll">
                {filtered.map((u) => (
                  <button
                    key={u.id}
                    className={'users-list-item' + (!inviting && selId === u.id ? ' active' : '')}
                    onClick={() => { setInviting(false); setSelId(u.id); }}
                  >
                    <Avatar user={u} size={28} />
                    <span className="users-li-text">
                      <span className="users-li-name">
                        {u.name}
                        {u.disabled && <span className="badge">{t('deactivated')}</span>}
                        {u.orgRole === 'owner'
                          ? <span className="badge">{t('owner')}</span>
                          : u.isAdmin && <span className="badge">{t('admin')}</span>}
                      </span>
                      <span className="users-li-email">{u.email}</span>
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && <div className="dialog-hint">{t('Nobody found.')}</div>}
              </div>
            </aside>

            <section className="users-detail-pane">
              {inviting ? (
                <InvitePanel
                  workspaces={access.workspaces}
                  onCancel={() => setInviting(false)}
                  onCreated={() => { setInviting(false); load(); }}
                />
              ) : sel ? (
                <>
                  <div className="users-detail-head">
                    <Avatar user={sel} size={48} />
                    <div className="users-detail-id">
                      <div className="users-detail-name">
                        {sel.name}
                        {sel.orgRole === 'owner'
                          ? <span className="badge">{t('Instance owner')}</span>
                          : sel.isAdmin && <span className="badge">{t('Instance admin')}</span>}
                      </div>
                      <div className="users-detail-email">{sel.email}</div>
                    </div>
                  </div>

                  {/* The owner runs the instance — they can be neither demoted
                      nor deleted here, or it would be left with nobody in
                      charge. */}
                  <div className="users-detail-actions">
                    {sel.id !== me.id && sel.orgRole !== 'owner' && (
                      <Button size="sm" onClick={() => void toggleAdmin(sel)}>
                        {sel.isAdmin ? t('Revoke admin rights') : t('Make instance admin')}
                      </Button>
                    )}
                    {sel.id !== me.id && sel.orgRole !== 'owner' && (
                      <Button size="sm" onClick={() => void toggleDisabled(sel)}>
                        {sel.disabled ? t('Reactivate') : t('Deactivate account')}
                      </Button>
                    )}
                    {/* Deleting destroys the account's personal space. That is
                        control over data and belongs to the owner — an admin
                        deactivates, and nothing is lost that way. */}
                    {sel.id !== me.id && sel.orgRole !== 'owner' && me.orgRole === 'owner' && (
                      <Button size="sm" tone="destructive" onClick={() => void remove(sel)}>
                        {t('Delete user')}
                      </Button>
                    )}
                    {sel.id !== me.id && sel.orgRole !== 'owner' && me.orgRole !== 'owner' && (
                      <span className="dialog-hint">
                        {t(
                          'Only the owner can delete permanently. The account would take this person’s personal space with it.',
                        )}
                      </span>
                    )}
                    {/* Handover: owner only, and only to an active admin
                        account. Without this path the role could not be passed
                        on at all — and two error messages advise doing exactly
                        that. */}
                    {me.orgRole === 'owner' && sel.id !== me.id && sel.isAdmin && !sel.disabled && (
                      <Button size="sm" onClick={() => void handOver(sel)}>
                        {t('Hand over the instance')}
                      </Button>
                    )}
                    {sel.orgRole === 'owner' && (
                      <span className="dialog-hint">
                        {t('The owner runs this instance. Their role is not changed here.')}
                      </span>
                    )}
                  </div>

                  <h3 className="users-section-title">{t('Workspace access')}</h3>
                  <div className="ws-access-list">
                    {access.workspaces.map((ws) => {
                      const role = roleOf(sel.id, ws.id);
                      // The server permits role changes only where they are due:
                      // never for yourself (that is what emergency access is
                      // for), and as an admin only in your own workspaces. The
                      // interface draws the same line rather than letting
                      // clicks run into a 403.
                      const mayEdit =
                        sel.id !== me.id &&
                        (me.orgRole === 'owner' || roleOf(me.id, ws.id) === 'admin');
                      const mayPeek = sel.id === me.id && me.orgRole === 'owner' && role === 'none';
                      return (
                        <div key={ws.id} className={'ws-access-row' + (role !== 'none' ? ' has-access' : '')}>
                          <span className="ws-access-name">{ws.name}</span>
                          {mayPeek && (
                            <Button size="sm"
                              title={t(
                                'Time-limited access with a stated reason, logged and shown to the people in charge',
                              )}
                              onClick={() => void requestBreakGlass(ws.id, ws.name)}
                            >
                              {t('Emergency access')}
                            </Button>
                          )}
                          <ToggleGroup
                            className="ws-role-seg"
                            label={ws.name}
                            value={role}
                            disabled={!mayEdit}
                            onValueChange={(v) => void setRole(sel.id, ws.id, v)}
                            items={roleOptions().map((r) => ({
                              value: r.v,
                              label: r.label,
                              rank: r.v,
                              title: mayEdit
                                ? undefined
                                : sel.id === me.id
                                  ? t('You cannot grant yourself access here.')
                                  : t('Only the owner or an admin of this workspace can change this.'),
                            }))}
                          />
                        </div>
                      );
                    })}
                    {access.workspaces.length === 0 && (
                      <div className="dialog-hint">{t('No workspaces yet.')}</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="dialog-hint users-empty">{t('Pick a user on the left.')}</div>
              )}
            </section>
          </div>
          <div className="dialog-actions">
            <Button onClick={onClose}>{t('Close')}</Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// Inviting with a workspace assignment: name, email, password, instance admin,
// and a role per workspace (default: no access, so assigning is deliberate).
function InvitePanel({
  workspaces,
  onCancel,
  onCreated,
}: {
  workspaces: WsRef[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ws = workspaces
        .map((w) => ({ id: w.id, role: roles[w.id] ?? 'none' }))
        .filter((w) => w.role !== 'none');
      await api.createUser({ name, email, password, isAdmin, workspaces: ws });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="invite-panel" onSubmit={submit}>
      <div className="users-detail-head">
        <div className="invite-avatar-placeholder">+</div>
        <div className="users-detail-id">
          <div className="users-detail-name">{t('Create a new user')}</div>
          <div className="users-detail-email">{t('Creates the account straight away. No email is sent.')}</div>
        </div>
      </div>
      <label className="profile-label">{t('Name')}</label>
      <input className="prop-input profile-input" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="profile-label">{t('Email')}</label>
      <input className="prop-input profile-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="profile-label">{t('Initial password (min. 8 characters)')}</label>
      <input className="prop-input profile-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <label className="check-label" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        {t('Instance admin (may manage everything)')}
      </label>

      <h3 className="users-section-title">{t('Workspace access')}</h3>
      <div className="ws-access-list">
        {workspaces.map((ws) => {
          const role = roles[ws.id] ?? 'none';
          return (
            <div key={ws.id} className={'ws-access-row' + (role !== 'none' ? ' has-access' : '')}>
              <span className="ws-access-name">{ws.name}</span>
              <ToggleGroup
                className="ws-role-seg"
                label={ws.name}
                value={role}
                onValueChange={(v) => setRoles((m) => ({ ...m, [ws.id]: v }))}
                items={roleOptions().map((r) => ({ value: r.v, label: r.label, rank: r.v }))}
              />
            </div>
          );
        })}
      </div>

      {error && <div className="login-error">{error}</div>}
      <div className="invite-actions">
        <Button type="button" onClick={onCancel}>{t('Cancel')}</Button>
        <Button emphasis="high" type="submit" disabled={busy}>{t('Create user')}</Button>
      </div>
    </form>
  );
}

export function TokensModal({ onClose }: { onClose: () => void }) {
  useExclusiveModal(onClose);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('write');
  const [wsMode, setWsMode] = useState<'all' | 'some'>('all');
  const [pickedWs, setPickedWs] = useState<string[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<'token' | 'cmd' | null>(null);
  const [publicBase, setPublicBase] = useState(window.location.origin);

  const load = () => void api.listTokens().then(setTokens);
  useEffect(() => {
    void api
      .publicBase()
      .then((r) => r.base && setPublicBase(r.base.replace(/\/$/, '')))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    void api.listWorkspaces().then(setWorkspaces);
  }, []);

  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;
  const toggleWs = (id: string) =>
    setPickedWs((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard the fail-open: "specific workspaces" with nothing picked must not
    // silently create an all-workspaces token (the server rejects it too).
    if (wsMode === 'some' && pickedWs.length === 0) {
      toast(t('Pick at least one workspace (or “All workspaces”).'));
      return;
    }
    const chosen = wsMode === 'some' ? pickedWs : [];
    const res = await api.createToken(name || 'API token', scope, chosen);
    setFresh(res.token);
    setName('');
    setWsMode('all');
    setPickedWs([]);
    setCopied(null);
    load();
  };

  // A ready-to-paste connection command. The base is the instance's PUBLIC
  // address (domain/tunnel) when one is configured — an agent host outside the
  // LAN can't reach the internal address this browser happens to use. The token
  // rides in the URL so clients without a headers UI work too.
  const mcpCommand = fresh ? `claude mcp add --transport http nigari ${publicBase}/mcp/${fresh}` : '';

  return (
    <Portal>
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog">
        <h2>{t('API tokens')}</h2>
        <p className="dialog-hint">
          {t('Tokens let agents and scripts use the REST API and the MCP endpoint')}{' '}
          (<code>/mcp</code>) {t('with')} <code>Authorization: Bearer &lt;token&gt;</code>.
        </p>
        {fresh && (
          <div className="token-fresh">
            <div>{t('Copy this token now. It will not be shown again:')}</div>
            <code>{fresh}</code>
            <Button onClick={() => {
                void navigator.clipboard.writeText(fresh);
                setCopied('token');
              }}
            >
              {copied === 'token' ? t('Copied ✓') : t('Copy token')}
            </Button>
            <div style={{ marginTop: 10 }}>
              {t('Or connect an agent in one step. Paste this into your terminal:')}
            </div>
            <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{mcpCommand}</code>
            <Button onClick={() => {
                void navigator.clipboard.writeText(mcpCommand);
                setCopied('cmd');
              }}
            >
              {copied === 'cmd' ? t('Copied ✓') : t('Copy MCP command')}
            </Button>
          </div>
        )}
        <div className="user-list">
          {/* `tk`, not `t` — the loop variable would shadow the translate function. */}
          {tokens.map((tk) => (
            <div key={tk.id} className="user-row">
              <span className="user-row-name">
                <Key size={13} /> {tk.name}{' '}
                <span className={'token-scope ' + (tk.scope === 'read' ? 'read' : 'write')}>
                  {tk.scope === 'read' ? t('read-only') : t('read-write')}
                </span>
              </span>
              <span className="user-row-email">
                {tk.workspaces.length === 0
                  ? t('all workspaces')
                  : tk.workspaces.map(wsName).join(', ')}
                {' · '}
                {tk.lastUsedAt
                  ? t('used {date}', { date: formatDay(tk.lastUsedAt) })
                  : t('never used')}
                {/* WHERE from. A token that travels in a URL (/mcp/{token})
                    cannot be kept secret, so the defence is noticing: an
                    address nobody recognises is a question worth asking, and
                    the answer is one click away (Revoke). */}
                {tk.lastUsedIp && (
                  <>
                    {' · '}
                    <span className="token-origin">{tk.lastUsedIp}</span>
                  </>
                )}
              </span>
              <Button
                emphasis="low"
                tone="destructive"
                icon={<X size={14} />}
                label={t('Revoke')}
                onClick={async () => {
                  await api.deleteToken(tk.id);
                  load();
                }}
              />
            </div>
          ))}
          {tokens.length === 0 && <div className="dialog-hint">{t('No tokens yet.')}</div>}
        </div>
        <form className="user-add" onSubmit={create} style={{ flexWrap: 'wrap' }}>
          <input value={name} placeholder={t('Token name (e.g. claude-code)')} onChange={(e) => setName(e.target.value)} />
          <select
            className="prop-select"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'read' | 'write')}
            title={t('Read-only tokens cannot create, edit, delete or upload')}
          >
            <option value="write">{t('Read-write')}</option>
            <option value="read">{t('Read-only')}</option>
          </select>
          <select
            className="prop-select"
            value={wsMode}
            onChange={(e) => setWsMode(e.target.value as 'all' | 'some')}
            title={t('Limit which workspaces this token can reach')}
          >
            <option value="all">{t('All workspaces')}</option>
            <option value="some">{t('Specific workspaces…')}</option>
          </select>
          <Button emphasis="high" type="submit">{t('Create token')}</Button>
          {wsMode === 'some' && (
            <div className="token-ws-picker" style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
              {workspaces.map((w) => (
                <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={pickedWs.includes(w.id)}
                    onChange={() => toggleWs(w.id)}
                  />
                  {w.name}
                </label>
              ))}
              {workspaces.length === 0 && <span className="dialog-hint">{t('No workspaces.')}</span>}
            </div>
          )}
        </form>
        <Button className="dialog-close" onClick={onClose}>{t('Close')}</Button>
      </div>
    </div>
    </Portal>
  );
}
