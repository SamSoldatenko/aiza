import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { getPreferences, setPreferences } from '@/lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface Preferences {
  theme: ThemeMode;
}

const defaultPreferences: Preferences = {
  theme: 'system',
};

interface PreferencesContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const lightTheme = createTheme({ palette: { mode: 'light' } });
const darkTheme = createTheme({ palette: { mode: 'dark' } });

// Device-wide preferences (not tied to any backend or workspace) plus the MUI
// ThemeProvider and the Tailwind `dark` class, kept in sync.
export function PreferencesProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const [prefs, setPrefs] = useState<Preferences>(() => ({ ...defaultPreferences, ...getPreferences({}) }));

  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const resolvedTheme: 'light' | 'dark' =
    prefs.theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : prefs.theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((theme: ThemeMode) => {
    setPrefs((prev) => {
      const next = { ...prev, theme };
      setPreferences(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme: prefs.theme, setTheme }), [prefs.theme, setTheme]);

  return (
    <PreferencesContext.Provider value={value}>
      <ThemeProvider theme={resolvedTheme === 'dark' ? darkTheme : lightTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
