'use client';

import { useMemo, useState } from 'react';
import { useFontCatalogue } from '../../../shared/hooks/useFontCatalogue';
import { DzineCanvasEditor } from '../components';
import { SharedPage } from './SharedPage';
import { WelcomePage } from './WelcomePage';

export const DesignPage = () => {
  const [view, setView] = useState<'welcome' | 'editor'>('welcome');
  const [editorKey, setEditorKey] = useState(0);
  const googleFontList = useFontCatalogue();

  /**
   * A share link is `?share=<token>` on the app itself, because the app has no
   * router: the whole interface is state inside this component, and a design is
   * opened by clicking rather than by URL. A query parameter is the smallest
   * thing that makes a link work, and it keeps every existing path intact.
   */
  const shareToken = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('share');
    return value?.trim() || null;
  }, []);

  if (shareToken) {
    return <SharedPage token={shareToken} />;
  }

  return view === 'welcome' ? (
    <WelcomePage
      onOpenDesign={() => {
        setEditorKey((key) => key + 1);
        setView('editor');
      }}
    />
  ) : (
    <DzineCanvasEditor
      key={editorKey}
      googleFontList={googleFontList}
      onBackHome={() => setView('welcome')}
    />
  );
};
