import { Fragment } from 'react';
import { t } from '../i18n';
import { formatBytes, formatMoment } from '../format';
import type { UpgradeState } from '../api';

// The maintenance tab's "Database upgrades" block (spec 008, US7): which
// upgrade step the database is at, the newest this release knows, when the
// last upgrade ran, and the copies taken before upgrades. It answers the
// question an admin has after an update went wrong, "what did it do, and
// what can I go back to?", without the start-up log. Its own module because
// AdminSettings.tsx is long already, and this block will grow with the steps.
export function DatabaseUpgrades({ upgrade }: { upgrade: UpgradeState }) {
  const { step, newest, lastAt, copies } = upgrade;
  return (
    <>
      <div className="info-grid">
        <span>{t('Upgrade step')}</span>
        <strong>
          {step === newest
            ? t('{step}, the newest this release knows', { step })
            : t('{step} of {newest}', { step, newest })}
        </strong>
        {/* When the step the database is at was applied. On a new instance that
            is when it was set up, not an upgrade, so the label says "applied"
            and not "last upgrade": that read as an upgrade that never ran. */}
        {lastAt && (
          <>
            <span>{t('Step applied')}</span>
            <strong>{formatMoment(lastAt)}</strong>
          </>
        )}
        <span>{t('Copies before upgrades')}</span>
        {copies.length === 0 ? (
          <strong>{t('None yet')}</strong>
        ) : (
          copies.map((c, i) => (
            // The first copy shares the label's row; the others sit under it.
            <Fragment key={c.name}>
              {i > 0 && <span />}
              <strong>
                {c.name} · {formatBytes(c.size)} · {formatMoment(c.takenAt)}
              </strong>
            </Fragment>
          ))
        )}
      </div>
      <p className="dialog-hint settings-hint">
        {t('Before an update changes the database, nigari copies it into the data directory and keeps the newest three. The self-hosting guide says how to go back to one.')}
      </p>
    </>
  );
}
