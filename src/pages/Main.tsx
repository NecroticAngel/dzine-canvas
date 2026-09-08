import { DesignPage } from '../features/design/pages';
import { AppThemeProvider } from '../shared/theme';

export default function Page() {
  return (
    <AppThemeProvider>
      <DesignPage />
    </AppThemeProvider>
  );
}
