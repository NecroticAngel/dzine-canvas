import CaretDoubleLeftIcon from '@duyank/icons/regular/CaretDoubleLeft';
import CaretDoubleRightIcon from '@duyank/icons/regular/CaretDoubleRight';
import { useEditor } from '@lidojs/design-editor';
import { useEffect, useState } from 'react';

const pageThumbColor = (page: {
  layers?: { ROOT?: { props?: { color?: unknown } } };
}) => String(page.layers?.ROOT?.props?.color ?? '#ffffff');

const PAGES_PANEL_KEY = 'necrozine-pages-panel';

/**
 * Whether the panel starts minimised. Same storage shape as the canvas view
 * (`necrozine-canvas-view`), so a future option has somewhere obvious to go.
 */
const readCollapsed = () => {
  try {
    const raw = localStorage.getItem(PAGES_PANEL_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as { collapsed?: unknown }).collapsed === true;
  } catch {
    return false;
  }
};

export const PagesPanel = () => {
  const { pages, activePage, actions } = useEditor();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(PAGES_PANEL_KEY, JSON.stringify({ collapsed }));
    } catch {
      // A full quota must not break the editor.
    }
  }, [collapsed]);

  // One control for both states, so the strip that is left can be reopened by the
  // same thing that closed it — a panel you cannot get back is worse than an open
  // one, which is why minimising keeps a target on screen.
  const minimiseButton = (
    <button
      type="button"
      css={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: 'var(--app-text)',
        cursor: 'pointer',
        ':hover': {
          background: 'var(--app-surface-2)',
          color: 'var(--app-text-strong)',
        },
      }}
      onClick={() => setCollapsed((value) => !value)}
      aria-expanded={!collapsed}
      aria-label={
        collapsed ? 'Show the pages panel' : 'Minimise the pages panel'
      }
      title={collapsed ? 'Show pages' : 'Minimise pages'}
    >
      {collapsed ? <CaretDoubleLeftIcon /> : <CaretDoubleRightIcon />}
    </button>
  );

  return (
    <div
      css={{
        // Narrowing rather than hiding: the toggle has to stay reachable.
        width: collapsed ? 36 : 168,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--app-panel)',
        borderLeft: '1px solid var(--app-border-strong)',
        color: 'var(--app-text)',
        transition: 'width .15s ease',
        '@media (max-width: 900px)': {
          display: 'none',
        },
      }}
    >
      {collapsed && (
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '10px 0',
          }}
        >
          {minimiseButton}
          <span
            css={{
              writingMode: 'vertical-rl',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--app-text-muted)',
            }}
          >
            Pages
          </span>
        </div>
      )}
      <div
        css={{
          height: 48,
          flexShrink: 0,
          display: collapsed ? 'none' : 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          borderBottom: '1px solid var(--app-border)',
          fontWeight: 700,
          color: 'var(--app-text-strong)',
        }}
      >
        <span css={{ marginRight: 'auto' }}>Pages</span>
        <button
          type="button"
          css={{
            border: 'none',
            background: 'var(--app-surface)',
            color: 'var(--app-text-strong)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            ':hover': { background: 'var(--app-surface-2)' },
          }}
          onClick={() => actions.addPage()}
          title="Add page"
        >
          + Add
        </button>
        {minimiseButton}
      </div>

      <div
        css={{
          flex: 1,
          display: collapsed ? 'none' : 'flex',
          overflowY: 'auto',
          padding: 12,
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {pages.map((page, index) => {
          const active = index === activePage;
          return (
            <div
              key={`page-${index}`}
              css={{
                borderRadius: 10,
                border: active
                  ? '2px solid #3d8eff'
                  : '1px solid var(--app-border)',
                background: active
                  ? 'rgba(61,142,255,.12)'
                  : 'var(--app-surface)',
                padding: 8,
              }}
            >
              <button
                type="button"
                css={{
                  display: 'block',
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                }}
                onClick={() => actions.goToPage(index)}
              >
                <div
                  css={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    borderRadius: 6,
                    background: pageThumbColor(page),
                    border: '1px solid var(--app-border)',
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.04)',
                    marginBottom: 8,
                  }}
                />
                <div
                  css={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--app-text-strong)',
                  }}
                >
                  Page {index + 1}
                </div>
              </button>
              <div
                css={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  css={{
                    flex: 1,
                    border: 'none',
                    background: 'var(--app-panel)',
                    color: 'var(--app-text)',
                    borderRadius: 6,
                    padding: '4px 0',
                    fontSize: 11,
                    cursor: 'pointer',
                    ':hover': { color: 'var(--app-text-strong)' },
                  }}
                  onClick={() => actions.duplicatePage(index)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  disabled={pages.length <= 1}
                  css={{
                    flex: 1,
                    border: 'none',
                    background: 'var(--app-panel)',
                    color: pages.length <= 1 ? 'var(--app-text-muted)' : '#ff8f8f',
                    borderRadius: 6,
                    padding: '4px 0',
                    fontSize: 11,
                    cursor: pages.length <= 1 ? 'not-allowed' : 'pointer',
                    opacity: pages.length <= 1 ? 0.5 : 1,
                  }}
                  onClick={() => {
                    if (pages.length <= 1) return;
                    if (
                      !window.confirm(
                        `Delete page ${index + 1}? This cannot be undone.`,
                      )
                    ) {
                      return;
                    }
                    actions.deletePage(index);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
