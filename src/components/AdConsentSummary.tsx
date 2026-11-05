import { t } from '@/lib/i18n';
import type { AdConsentChoices } from '@/lib/ad-consent';

export function AdConsentSummary({ choices }: { choices: AdConsentChoices }) {
  const rows = ([
    ['adPrivacyStorage', choices.storage],
    ['adPrivacyProfile', choices.adProfile],
    ['adPrivacyUseProfile', choices.useAdProfile],
  ] as const).filter(([, choice]) => choice !== 'unknown');

  if (rows.length === 0) return null;

  return (
    <div className="px-3 py-3" aria-live="polite">
      <p className="text-xs font-semibold text-muted-foreground">{t('adPrivacySaved')}</p>
      <p className="text-xs text-muted-foreground mt-1 mb-3">{t('adPrivacySource')}</p>
      <dl className="space-y-3">
        {rows.map(([label, choice]) => (
          <div key={label} className="flex items-start gap-3">
            <dt className="flex-1 min-w-0 text-sm text-foreground">{t(label)}</dt>
            <dd className={`max-w-[40%] text-right text-sm font-semibold ${choice === 'allowed' ? 'text-primary' : 'text-muted-foreground'}`}>
              {t(choice === 'allowed' ? 'adPrivacyAllowed' : 'adPrivacyDenied')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}