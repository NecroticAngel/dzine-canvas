import XIcon from '@duyank/icons/regular/X';
import type { SerializedPage } from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import axios from 'axios';
import { type FC, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useAsync } from 'react-use';

interface Template {
  id: string;
  name: string;
  img: string;
  /** Published by us and shared with this workspace, rather than its own. */
  shared?: boolean;
}

export const TemplateContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { actions, activePage } = useEditor((state) => ({
    activePage: state.activePage,
  }));
  useAsync(async () => {
    try {
      // The list is metadata only; a template's content arrives when you pick
      // one, because it is a whole design page.
      const response = await axios.get<Template[]>('/templates');
      const list = Array.isArray(response.data) ? response.data : [];
      setTemplates(list);
      setLoadError(
        list.length === 0
          ? 'No templates are shared with this workspace yet.'
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
  const addPage = async (template: Template) => {
    if (pendingId) return;
    setPendingId(template.id);
    setLoadError(null);
    try {
      const response = await axios.get<{ elements?: SerializedPage }>(
        `/templates/${encodeURIComponent(template.id)}`,
      );
      if (!response.data?.elements) {
        setLoadError('That template has no content.');
        return;
      }
      // This copies the page into the design being edited. The template itself
      // is never touched, so a shared one cannot be changed from here.
      actions.setPage(activePage, response.data.elements);
      if (isMobile) {
        onClose();
      }
    } catch {
      setLoadError('Could not load that template. Try again.');
    } finally {
      setPendingId(null);
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
          borderBottom: '1px solid var(--app-border)',
          padding: '0 20px',
        }}
      >
        <p
          css={{
            lineHeight: '48px',
            fontWeight: 600,
            color: 'var(--app-text-strong)',
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
            gridTemplateColumns: 'minmax(0,1fr)',
            gridGap: 8,
            padding: '16px',
          }}
        >
          {isLoading && <div>Loading...</div>}
          {!isLoading && loadError && (
            <div
              css={{
                gridColumn: '1 / -1',
                color: 'var(--app-text-muted)',
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
              key={item.id || index}
              css={{
                position: 'relative',
                cursor: pendingId ? 'progress' : 'pointer',
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid var(--app-border)',
                background: 'var(--app-surface)',
                opacity: pendingId && pendingId !== item.id ? 0.5 : 1,
              }}
              onClick={() => void addPage(item)}
              title={item.shared ? `${item.name} — shared with you` : `${item.name} — yours`}
            >
              <img
                alt={item.name || 'Template'}
                loading="lazy"
                src={item.img}
                css={{ display: 'block', width: '100%', height: 'auto' }}
              />
              <span
                css={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 999,
                  color: item.shared ? '#fff' : 'var(--app-text-strong)',
                  background: item.shared
                    ? 'rgba(61,142,255,.9)'
                    : 'rgba(255,255,255,.82)',
                  border: item.shared
                    ? 'none'
                    : '1px solid var(--app-border)',
                }}
              >
                {pendingId === item.id
                  ? 'Opening…'
                  : item.shared
                    ? 'Shared'
                    : 'Yours'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
