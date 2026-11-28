import { Button } from '../ui/Button';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import { KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';

// The consent screen — the first place in this product where a human decides
// how far an agent reaches WHILE LOOKING at what they are granting.
//
// That is the part worth more than the cryptography around it. An API token's
// reach is decided in a settings dialog, out of context, where "all workspaces"
// is one click and the narrow choice is work. Here the choice is the screen: a
// list of workspaces, none of them ticked, and a button that stays dead until
// one is.
//
// THE CLIENT NAME IS A CLAIM, not an identity. It comes from an open
// registration endpoint, so anybody can register as "nigari Official". The
// screen says so rather than dressing it up — a consent screen that lends
// credibility it cannot check is worse than none.

interface RequestInfo {
  clientName: string;
  clientId: string;
  workspaces: { id: string; name: string }[];
  instanceName: string;
  host: string;
  // The host a metadata-URL client's document is served from; empty for a
  // client that registered (server/oauth_cimd.go).
  clientHost: string;
  // RFC 9207: the issuer the redirect back to the client carries as iss, so a
  // client talking to two servers can tell which one a code came from. The
  // server names it, the same value its metadata names.
  issuer: string;
}

export default function OAuthConsent() {
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get('client_id') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const challenge = params.get('code_challenge') ?? '';
  const method = params.get('code_challenge_method') ?? '';
  const state = params.get('state') ?? '';
  const resource = params.get('resource') ?? '';
  // What the client asked for, already narrowed by the server to a single
  // value. Parsing the space-separated list a second time here is how two
  // parsers end up disagreeing about what was granted.
  const asked = params.get('scope') === 'write' ? 'write' : 'read';

  const [info, setInfo] = useState<RequestInfo | null>(null);
  // The request only sets the starting point; the person granting it decides.
  // A client that asks for nothing in particular, which is what
  // `claude mcp add --transport http` does, otherwise got read access with no
  // way to say more short of editing the client's configuration (#83). The
  // token answer names the scope that was granted (RFC 6749 §3.3), so the
  // client learns it either way.
  const [scope, setScope] = useState<'read' | 'write'>(asked);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // "Everything, including whatever is made later" versus "these ones". The
  // difference is not convenience: a list of workspaces is a photograph of
  // today, and a workspace created next week — by a colleague, or by the agent
  // itself — is simply not in it. Both readings are legitimate, so it is asked
  // rather than assumed.
  const [reach, setReach] = useState<'all' | 'picked'>('picked');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .oauthRequestInfo(clientId, redirectUri)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [clientId, redirectUri]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Where the browser goes back to the client. Only once the server has
  // confirmed the address belongs to this client (info is set only then), and
  // never to a scheme the browser would run on this page instead of leaving
  // it: a javascript: address ran as script here, signed in as the person
  // deciding (#1130). The server refuses those too; this is the second guard.
  const backToClient = (params: Record<string, string>) => {
    if (!info) return;
    const u = new URL(redirectUri);
    if (['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:', 'filesystem:'].includes(u.protocol)) return;
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    window.location.href = u.toString();
  };

  const deny = () => {
    // Denying answers the client properly instead of leaving it hanging — a
    // silent close looks like a broken server and gets retried.
    backToClient({ error: 'access_denied', state, iss: info?.issuer ?? '' });
  };

  const approve = async () => {
    if (busy || (reach === 'picked' && picked.size === 0)) return;
    setBusy(true);
    setError('');
    try {
      const { code } = await api.oauthApprove({
        clientId,
        redirectUri,
        codeChallenge: challenge,
        codeChallengeMethod: method,
        scope,
        resource,
        allWorkspaces: reach === 'all',
        workspaces: reach === 'all' ? [] : [...picked],
      });
      backToClient({ code, state, iss: info?.issuer ?? '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (error && !info) return <div className="consent-page"><p className="dialog-error">{error}</p></div>;
  if (!info) return <div className="consent-page"><p className="dialog-hint">{t('Loading…')}</p></div>;

  return (
    <div className="consent-page">
      <div className="consent-card">
        {/* Which instance is asking. A consent screen with no identity could be
            any nigari anywhere, and "what am I handing this to" is the first
            question somebody should be able to answer at a glance. */}
        <div className="consent-brand">
          <img src="/favicon.svg" alt="" width={26} height={26} />
          <span className="consent-brand-name">{info.instanceName || 'nigari'}</span>
          <span className="consent-brand-host">{info.host}</span>
        </div>
        <h1>
          <KeyRound size={20} /> {t('Grant access?')}
        </h1>
        <p className="consent-lead">
          {t('“{client}” is asking to work in your account.').replace('{client}', info.clientName)}
        </p>
        {/* A client may name itself with a metadata document at an https
            address. Then the name is what that host serves, and showing the
            host lets a person spot a name that imitates another client (section
            6.4 of the draft). A registered client has no host to show. */}
        {info.clientHost && (
          <p className="consent-sub">{t('from {host}').replace('{host}', info.clientHost)}</p>
        )}

        {/* Said plainly, because the name above is whatever the client typed
            when it registered, or whatever its host serves. */}
        <p className="consent-warn">
          <TriangleAlert size={14} /> {t('That name was chosen by whoever set up the connection. Only continue if you started this yourself.')}
        </p>

        <div className="consent-block">
          <div className="consent-block-head">{t('It will be allowed to')}</div>
          <label className="consent-ws">
            <input type="radio" checked={scope === 'read'} onChange={() => setScope('read')} />
            <span>{t('read pages')}</span>
          </label>
          <label className="consent-ws">
            <input type="radio" checked={scope === 'write'} onChange={() => setScope('write')} />
            <span>{t('read and change pages')}</span>
          </label>
        </div>

        <div className="consent-block">
          <div className="consent-block-head">{t('Where')}</div>
          <label className="consent-ws">
            <input type="radio" checked={reach === 'all'} onChange={() => setReach('all')} />
            <span>
              {t('Every workspace, including ones added later')}
              <span className="consent-sub">{t('The connection follows along when you make a new one.')}</span>
            </span>
          </label>
          <label className="consent-ws">
            <input type="radio" checked={reach === 'picked'} onChange={() => setReach('picked')} />
            <span>
              {t('Only the ones I pick')}
              <span className="consent-sub">{t('A workspace made later stays out until you say otherwise.')}</span>
            </span>
          </label>

          {/* Nothing is ticked to begin with. A pre-ticked list is a screen
              people click past; an empty one is a decision. */}
          {reach === 'picked' && (
            <div className="consent-ws-list">
              {info.workspaces.map((w) => (
                <label key={w.id} className="consent-ws">
                  <input type="checkbox" checked={picked.has(w.id)} onChange={() => toggle(w.id)} />
                  {w.name}
                </label>
              ))}
              {info.workspaces.length === 0 && (
                <p className="dialog-hint">{t('You are not in any workspace yet.')}</p>
              )}
            </div>
          )}
        </div>

        <p className="consent-note">
          <ShieldCheck size={14} />{' '}
          {t('You can end this connection at any time in your account settings.')}
        </p>

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-actions">
          <Button size="sm" onClick={deny}>
            {t('Deny')}
          </Button>
          <Button emphasis="high"
            disabled={busy || (reach === 'picked' && picked.size === 0)}
            onClick={() => void approve()}
          >
            {t('Allow')}
          </Button>
        </div>
      </div>
    </div>
  );
}
