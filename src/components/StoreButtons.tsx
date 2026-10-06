import { getStoreLinks } from '@/lib/app-links';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Download buttons for the right store(s); the first is the primary one. */
export function StoreButtons({ onClick }: { onClick?: (store: string) => void }) {
  const { t } = useTranslation();
  const links = getStoreLinks();
  return (
    <div className="w-full max-w-sm flex flex-col gap-3">
      {links.map((l, i) => (
        <a
          key={l.store}
          href={l.url}
          onClick={() => onClick?.(l.store)}
          className={cn(
            'w-full py-4 rounded-2xl font-display font-bold text-base text-center',
            i === 0
              ? 'bg-primary text-primary-foreground shadow-[0_4px_16px_hsl(36_78%_55%/0.3)]'
              : 'bg-secondary text-foreground border border-border/50',
          )}
        >
          {l.store === 'apple' ? t('joinDownload') : 'Get it on Google Play'}
        </a>
      ))}
    </div>
  );
}
