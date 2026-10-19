import { useEffect, useState } from 'react';
import { get, put } from './api';

export type Appearance = 'light' | 'dark' | 'system';
type Theme = 'light' | 'dark';
const storageKey = 'organize-appearance';
const valid = (value: unknown): value is Appearance => value === 'light' || value === 'dark' || value === 'system';

export function useAppearance(userId: string | undefined, onError: (message: string) => void) {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try { const value = localStorage.getItem(storageKey); return valid(value) ? value : 'system'; }
    catch { return 'system'; }
  });
  const [effective, setEffective] = useState<Theme>('light');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const next: Theme = appearance === 'system' ? (media.matches ? 'dark' : 'light') : appearance;
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#151e30' : '#0b3f75');
      setEffective(next);
    };
    apply();
    media.addEventListener('change', apply);
    try { localStorage.setItem(storageKey, appearance); } catch { /* private browsing */ }
    return () => media.removeEventListener('change', apply);
  }, [appearance]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    get<{ preferences: { appearance?: unknown } }>('/preferences').then(({ preferences }) => {
      if (active) setAppearance(valid(preferences.appearance) ? preferences.appearance : 'system');
    }).catch(error => { if (active) onError((error as Error).message); });
    return () => { active = false; };
  }, [userId, onError]);

  const changeAppearance = async (next: Appearance) => {
    if (!userId || saving || next === appearance) return;
    const previous = appearance;
    setAppearance(next);
    setSaving(true);
    try {
      const { preferences } = await get<{ preferences: Record<string, unknown> }>('/preferences');
      await put('/preferences', { ...preferences, appearance: next });
    } catch (error) {
      setAppearance(previous);
      onError((error as Error).message);
    } finally { setSaving(false); }
  };

  return { appearance, effective, saving, changeAppearance };
}
