import MoonIcon from '@duyank/icons/regular/Moon';
import SunIcon from '@duyank/icons/regular/Sun';
import { useAppTheme } from './AppTheme';

/**
 * Icon-only light/dark switcher.
 *
 * The state is carried by the icon itself — a sun while dark (click to go
 * light), a moon while light — so there is no visible label to clutter a dense
 * header. `title` and `aria-label` still spell it out for hover and for screen
 * readers.
 */
export const ThemeToggle = () => {
  const { mode, toggleMode } = useAppTheme();
  const label = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleMode}
      title={label}
      aria-label={label}
      aria-pressed={mode === 'dark'}
      css={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        padding: 0,
        flex: '0 0 auto',
        border: '1px solid var(--app-border)',
        background: 'var(--app-panel)',
        color: 'var(--app-text-strong)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'background .15s ease, border-color .15s ease',
        ':hover': {
          borderColor: 'var(--app-border-strong)',
          background: 'var(--app-surface-2)',
        },
      }}
    >
      {mode === 'dark' ? (
        <SunIcon width={18} height={18} />
      ) : (
        <MoonIcon width={18} height={18} />
      )}
    </button>
  );
};
