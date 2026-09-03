import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { FriendsList } from '@/components/multiplayer/FriendsList';
import { useTranslation } from '@/lib/i18n';

export default function FriendsListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const root = document.getElementById('root');
    document.documentElement.classList.remove('game-scroll-lock');
    document.body.classList.remove('game-scroll-lock');
    root?.classList.remove('game-scroll-lock');
    document.documentElement.classList.add('multiplayer-scroll-unlocked');
    document.body.classList.add('multiplayer-scroll-unlocked');
    root?.classList.add('multiplayer-scroll-unlocked');
    return () => {
      document.documentElement.classList.remove('multiplayer-scroll-unlocked');
      document.body.classList.remove('multiplayer-scroll-unlocked');
      root?.classList.remove('multiplayer-scroll-unlocked');
    };
  }, []);

  return (
    <div className="app-screen flex flex-col px-5 safe-top safe-bottom overflow-y-auto overscroll-contain">
      <div className="w-full max-w-md mx-auto py-6 space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center active:scale-95 transition"
            aria-label={t('friendStatsBack')}
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-xl font-display font-black text-foreground">
            {t('friendsListTitle')}
          </h1>
        </div>

        <p className="text-center text-xs text-muted-foreground px-4">
          {t('friendsListReminder')}
        </p>

        <FriendsList />
      </div>
    </div>
  );
}
