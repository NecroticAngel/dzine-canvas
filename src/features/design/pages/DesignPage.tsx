'use client';

import type { FontData } from '@lidojs/design-core';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { DzineCanvasEditor } from '../components';
import { WelcomePage } from './WelcomePage';

export const DesignPage = () => {
  const [view, setView] = useState<'welcome' | 'editor'>('welcome');
  const [editorKey, setEditorKey] = useState(0);
  const [googleFontList, setGoogleFontList] = useState<FontData[]>([]);

  useEffect(() => {
    const getFont = async () => {
      // The catalogue comes from our own API. It used to be fetched straight
      // from Google with `process.env.FONT_API_KEY`, which Vite does not inline,
      // so the request went out as `key=undefined` and answered 403 — leaving
      // the font list empty and a permanent 403 in the console.
      const data = await axios
        .get<{ fonts?: FontData[] }>('/fonts')
        .catch(() => ({ data: { fonts: [] } }));
      // The shared axios interceptor rewrites every failed GET into `{ data: [] }`,
      // so a rejection never reaches the `.catch` above and the payload can be an
      // array where an object was expected. Never trust the shape.
      const list = Array.isArray(data?.data?.fonts) ? data.data.fonts : [];
      setGoogleFontList(list.filter((font) => font?.name && font.fonts?.length));
    };
    void getFont();
  }, []);

  if (view === 'welcome') {
    return (
      <WelcomePage
        onOpenDesign={() => {
          setEditorKey((key) => key + 1);
          setView('editor');
        }}
      />
    );
  }

  return (
    <DzineCanvasEditor
      key={editorKey}
      googleFontList={googleFontList}
      onBackHome={() => setView('welcome')}
    />
  );
};
