import { getFrame } from '@/lib/cosmetics';

/** Bought avatar frame drawn as a ring behind a round avatar. Parent must be `relative`. */
export function AvatarFrame({ id, inset = 3 }: { id: string | null | undefined; inset?: number }) {
  const f = getFrame(id);
  if (!f) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute rounded-full -z-0"
      style={{ inset: -inset, background: f.ring, boxShadow: `0 0 6px ${f.glow}` }}
    />
  );
}
