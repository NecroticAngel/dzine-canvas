import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  createBlankPages,
  createDesignInLibrary,
  deleteDesignInLibrary,
  type DesignSummary,
  listDesignSummaries,
  openDesignInLibrary,
  renameDesignInLibrary,
} from '../../../utils/designLibrary';
import { useAppTheme } from '../../../shared/theme';

type WelcomePageProps = {
  onOpenDesign: (id: string) => void;
};

type NameDialog =
  | { mode: 'new' }
  | { mode: 'rename'; id: string; initial: string };

const formatUpdated = (ts: number) => {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export const WelcomePage = ({ onOpenDesign }: WelcomePageProps) => {
  const { mode, toggleMode } = useAppTheme();
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [dialog, setDialog] = useState<NameDialog | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setDesigns(listDesignSummaries());

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!dialog) return;
    setNameDraft(dialog.mode === 'rename' ? dialog.initial : '');
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dialog]);

  const openDesign = (id: string) => {
    const opened = openDesignInLibrary(id);
    if (!opened) {
      refresh();
      return;
    }
    onOpenDesign(opened.id);
  };

  const handleCreate = (name: string) => {
    const created = createDesignInLibrary(
      createBlankPages(),
      name.trim() || undefined,
    );
    onOpenDesign(created.id);
  };

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!dialog) return;
    const trimmed = nameDraft.trim();
    if (dialog.mode === 'new') {
      setDialog(null);
      handleCreate(trimmed);
      return;
    }
    if (!trimmed) return;
    renameDesignInLibrary(dialog.id, trimmed);
    setDialog(null);
    refresh();
  };

  const handleDelete = (design: DesignSummary) => {
    if (
      !window.confirm(
        `Delete “${design.name}”? This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteDesignInLibrary(design.id);
    refresh();
  };

  return (
    <div
      css={{
        minHeight: '100vh',
        width: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'auto',
        color: 'var(--app-text-strong)',
        background: `
          radial-gradient(ellipse 90% 60% at 50% -10%, rgba(61, 142, 255, 0.18), transparent 55%),
          radial-gradient(ellipse 50% 40% at 100% 100%, rgba(31, 157, 106, 0.12), transparent 50%),
          var(--app-workspace)
        `,
      }}
    >
      <div
        css={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: mode === 'dark' ? 0.35 : 0.2,
          backgroundImage: `
            linear-gradient(var(--app-border) 1px, transparent 1px),
            linear-gradient(90deg, var(--app-border) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 30%, #000 20%, transparent 75%)',
        }}
      />

      <header
        css={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '20px 28px',
        }}
      >
        <button
          type="button"
          onClick={toggleMode}
          css={{
            border: '1px solid var(--app-border)',
            background: 'var(--app-panel)',
            color: 'var(--app-text-strong)',
            borderRadius: 8,
            padding: '8px 14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {mode === 'dark' ? 'Light' : 'Dark'}
        </button>
      </header>

      <main
        css={{
          position: 'relative',
          maxWidth: 1100,
          margin: '0 auto',
          padding: '24px 28px 64px',
        }}
      >
        <section
          css={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 18,
            marginBottom: 48,
            minHeight: 'min(42vh, 360px)',
            justifyContent: 'center',
          }}
        >
          <img
            alt="D-Zine Canvas"
            src="./assets/dzine_canvas.png"
            css={{
              width: 'min(420px, 86vw)',
              height: 'auto',
              objectFit: 'contain',
              filter:
                mode === 'dark'
                  ? 'drop-shadow(0 18px 40px rgba(0,0,0,.45))'
                  : 'drop-shadow(0 12px 28px rgba(20,30,60,.18))',
            }}
          />
          <p
            css={{
              margin: 0,
              maxWidth: 420,
              fontSize: 18,
              lineHeight: 1.45,
              color: 'var(--app-text)',
              fontWeight: 600,
            }}
          >
            Open a design to keep editing, or start a fresh canvas.
          </p>
          <button
            type="button"
            onClick={() => setDialog({ mode: 'new' })}
            css={{
              border: 'none',
              background: '#3d8eff',
              color: '#fff',
              borderRadius: 10,
              padding: '12px 20px',
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 10px 28px rgba(61,142,255,.35)',
              ':hover': { background: '#2f7ae5' },
            }}
          >
            New design
          </button>
        </section>

        <section>
          <div
            css={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <h2
              css={{
                margin: 0,
                fontSize: 13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--app-text-muted)',
                fontWeight: 800,
              }}
            >
              Your designs
            </h2>
            <span css={{ color: 'var(--app-text-muted)', fontSize: 13 }}>
              {designs.length} saved
            </span>
          </div>

          <div
            css={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <button
              type="button"
              onClick={() => setDialog({ mode: 'new' })}
              css={{
                minHeight: 160,
                border: '1px dashed var(--app-border-strong)',
                background: 'transparent',
                borderRadius: 14,
                color: 'var(--app-text-strong)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontWeight: 700,
                fontSize: 15,
                ':hover': {
                  borderColor: '#3d8eff',
                  background: 'rgba(61,142,255,.08)',
                },
              }}
            >
              <span css={{ fontSize: 28, lineHeight: 1 }}>+</span>
              New design
            </button>

            {designs.map((design) => (
              <div
                key={design.id}
                css={{
                  border: '1px solid var(--app-border)',
                  background: 'var(--app-panel)',
                  borderRadius: 14,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 160,
                  transition: 'transform .15s ease, border-color .15s ease',
                  ':hover': {
                    borderColor: 'rgba(61,142,255,.55)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <button
                  type="button"
                  onClick={() => openDesign(design.id)}
                  css={{
                    flex: 1,
                    border: 'none',
                    background: `
                      linear-gradient(160deg, var(--app-surface-2), var(--app-surface)),
                      var(--app-surface)
                    `,
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left',
                    minHeight: 96,
                    position: 'relative',
                  }}
                >
                  <div
                    css={{
                      position: 'absolute',
                      inset: 18,
                      borderRadius: 8,
                      background: '#fff',
                      boxShadow: 'var(--app-canvas-shadow)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9aa0b5',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    CANVAS
                  </div>
                </button>
                <div
                  css={{
                    padding: '12px 14px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openDesign(design.id)}
                    css={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      css={{
                        fontWeight: 800,
                        fontSize: 15,
                        color: 'var(--app-text-strong)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {design.name}
                    </div>
                    <div
                      css={{
                        marginTop: 4,
                        fontSize: 12,
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      {formatUpdated(design.updatedAt)}
                    </div>
                  </button>
                  <div css={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() =>
                        setDialog({
                          mode: 'rename',
                          id: design.id,
                          initial: design.name,
                        })
                      }
                      css={{
                        border: '1px solid var(--app-border)',
                        background: 'transparent',
                        color: 'var(--app-text)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontWeight: 650,
                        fontSize: 12,
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(design)}
                      css={{
                        border: '1px solid var(--app-border)',
                        background: 'transparent',
                        color: '#d66',
                        borderRadius: 8,
                        padding: '6px 10px',
                        cursor: 'pointer',
                        fontWeight: 650,
                        fontSize: 12,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {designs.length === 0 && (
            <p
              css={{
                marginTop: 20,
                color: 'var(--app-text-muted)',
                fontSize: 14,
              }}
            >
              No designs yet — create your first one to get started.
            </p>
          )}
        </section>
      </main>

      {dialog && (
        <div
          role="presentation"
          css={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(8, 8, 16, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setDialog(null)}
        >
          <form
            css={{
              width: '100%',
              maxWidth: 380,
              background: 'var(--app-panel)',
              border: '1px solid var(--app-border)',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 18px 40px rgba(0,0,0,.45)',
            }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <div
              css={{
                color: 'var(--app-text-strong)',
                fontWeight: 700,
                fontSize: 16,
                marginBottom: 12,
              }}
            >
              {dialog.mode === 'new' ? 'Name your new design' : 'Rename design'}
            </div>
            <input
              ref={inputRef}
              value={nameDraft}
              placeholder="e.g. Cover page"
              css={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid var(--app-border-strong)',
                background: 'var(--app-surface)',
                color: 'var(--app-text-strong)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
                outline: 'none',
                ':focus': { borderColor: '#3d8eff' },
              }}
              onChange={(event) => setNameDraft(event.target.value)}
            />
            <div
              css={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                css={{
                  border: '1px solid var(--app-border)',
                  background: 'transparent',
                  color: 'var(--app-text)',
                  borderRadius: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                css={{
                  border: 'none',
                  background: '#3d8eff',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {dialog.mode === 'new' ? 'Create' : 'Rename'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
