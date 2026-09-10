'use client';

import type { FontData } from '@lidojs/design-core';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { DzineCanvasEditor } from '../components';
import { WelcomePage } from './WelcomePage';

type FontVariant =
  | 'regular'
  | 'italic'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900';

export const DesignPage = () => {
  const [view, setView] = useState<'welcome' | 'editor'>('welcome');
  const [editorKey, setEditorKey] = useState(0);
  const [googleFontList, setGoogleFontList] = useState<FontData[]>([]);

  useEffect(() => {
    const getFont = async () => {
      const data = await axios
        .get<{
          items: {
            family: string;
            variants: FontVariant[];
            files: Record<FontVariant, string>;
          }[];
        }>(
          `https://www.googleapis.com/webfonts/v1/webfonts?key=${process.env.FONT_API_KEY}`,
        )
        .catch(() => ({ data: { items: [] } }));
      const items = data.data.items;
      const res: FontData[] = items.map((i) => {
        const fonts = Object.entries(i.files).reduce(
          (acc, [fontWeight, file]) => {
            if (fontWeight === 'regular' || fontWeight === '400') {
              if (i.variants.includes('italic')) {
                acc.push({
                  style: 'Italic',
                  urls: [file],
                });
              }
              acc.push({
                urls: [file],
              });
            } else if (fontWeight === '600') {
              if (i.variants.includes('italic')) {
                acc.push({
                  style: 'Bold_Italic',
                  urls: [file],
                });
              }
              acc.push({
                style: 'Bold',
                urls: [file],
              });
            }
            return acc;
          },
          [] as FontData['fonts'],
        );
        return {
          name: i.family,
          fonts: fonts,
        };
      });
      setGoogleFontList(res);
    };
    getFont();
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
