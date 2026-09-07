import XIcon from '@duyank/icons/regular/X';
import type { SerializedPage } from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import axios from 'axios';
import { type FC, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useAsync } from 'react-use';

interface Template {
  id?: string;
  name?: string;
  img: string;
  elements: SerializedPage;
}

export const TemplateContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { actions, activePage } = useEditor((state) => ({
    activePage: state.activePage,
  }));
  useAsync(async () => {
    try {
      const response = await axios.get<Template[]>('/templates');
      const list = Array.isArray(response.data) ? response.data : [];
      setTemplates(list);
      setLoadError(
        list.length === 0
          ? 'No templates yet. Start the API (`npm run api`) and add JSON files under api/data/templates.'
          : null,
      );
    } catch {
      setTemplates([]);
      setLoadError(
        'Could not reach the templates API. Run `npm run api` (or `npm run dev:all`).',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  const addPage = async (data: SerializedPage) => {
    actions.setPage(activePage, data);
    if (isMobile) {
      onClose();
    }
  };
  return (
    <div
      css={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflowY: 'auto',
        display: 'flex',
      }}
    >
      <div
        css={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          height: 48,
          borderBottom: '1px solid rgba(57,76,96,.15)',
          padding: '0 20px',
        }}
      >
        <p
          css={{
            lineHeight: '48px',
            fontWeight: 600,
            color: '#181C32',
            flexGrow: 1,
          }}
        >
          Templates
        </p>
        <div
          css={{
            fontSize: 20,
            flexShrink: 0,
            width: 32,
            height: 32,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={onClose}
        >
          <XIcon />
        </div>
      </div>
      <div
        css={{ flexDirection: 'column', overflowY: 'auto', display: 'flex' }}
      >
        <div
          css={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
            gridGap: 8,
            padding: '16px',
          }}
        >
          {isLoading && <div>Loading...</div>}
          {!isLoading && loadError && (
            <div
              css={{
                gridColumn: '1 / -1',
                color: '#5E6278',
                fontSize: 13,
                lineHeight: 1.5,
                padding: 8,
              }}
            >
              {loadError}
            </div>
          )}
          {templates.map((item, index) => (
            <div
              key={item.name ? `${item.name}-${index}` : index}
              css={{
                cursor: 'pointer',
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid rgba(57,76,96,.12)',
                background: '#fff',
              }}
              onClick={() => addPage(item.elements)}
              title={item.name}
            >
              <img
                alt={item.name || 'Template'}
                loading="lazy"
                src={item.img}
                css={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
