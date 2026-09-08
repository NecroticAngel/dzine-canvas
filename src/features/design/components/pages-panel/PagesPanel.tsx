import { useEditor } from '@lidojs/design-editor';

const pageThumbColor = (page: {
  layers?: { ROOT?: { props?: { color?: unknown } } };
}) => String(page.layers?.ROOT?.props?.color ?? '#ffffff');

export const PagesPanel = () => {
  const { pages, activePage, actions } = useEditor();

  return (
    <div
      css={{
        width: 168,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--app-panel)',
        borderLeft: '1px solid var(--app-border-strong)',
        color: 'var(--app-text)',
        '@media (max-width: 900px)': {
          display: 'none',
        },
      }}
    >
      <div
        css={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: '1px solid var(--app-border)',
          fontWeight: 700,
          color: 'var(--app-text-strong)',
        }}
      >
        <span>Pages</span>
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
      </div>

      <div
        css={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
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
