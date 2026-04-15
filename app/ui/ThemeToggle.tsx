'use client';

import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useSettings, ThemeMode } from './context/SettingsContext';

export default function ThemeToggle(): React.ReactElement {
  const { theme, setTheme } = useSettings();

  function handleChange(_: React.MouseEvent<HTMLElement>, newTheme: ThemeMode | null): void {
    if (newTheme) {
      setTheme(newTheme);
    }
  }

  return (
    <ToggleButtonGroup
      value={theme}
      exclusive
      onChange={handleChange}
      size="small"
    >
      <ToggleButton value="light" aria-label="light mode">
        <Sun size={18} />
      </ToggleButton>
      <ToggleButton value="system" aria-label="system mode">
        <Monitor size={18} />
      </ToggleButton>
      <ToggleButton value="dark" aria-label="dark mode">
        <Moon size={18} />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
