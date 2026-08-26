'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const storageKey = 'sakinzihin-theme';

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(storageKey, theme);
}

export function ThemeToggle() {
  const [theme, setCurrentTheme] = useState<Theme>('light');

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    setCurrentTheme(current);
  }, []);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`${nextTheme === 'dark' ? 'Koyu' : 'Açık'} temaya geç`}
      aria-pressed={theme === 'dark'}
      onClick={() => {
        setTheme(nextTheme);
        setCurrentTheme(nextTheme);
      }}
    >
      {theme === 'dark' ? (
        <Sun size={17} strokeWidth={1.7} />
      ) : (
        <Moon size={17} strokeWidth={1.7} />
      )}
    </button>
  );
}
