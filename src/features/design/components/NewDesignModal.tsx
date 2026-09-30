import { useEffect, useMemo, useState } from 'react';
import XIcon from '@duyank/icons/regular/X';
import MagnifyingGlassIcon from '@duyank/icons/regular/MagnifyingGlass';
// Used directly by the modal's own chrome, as well as via the shared icon map.
import RulerIcon from '@duyank/icons/regular/Ruler';
import SquaresFourIcon from '@duyank/icons/regular/SquaresFour';
import { PRESET_GROUPS, type CanvasPreset, type PresetGroup } from '../config/canvasPresets';
import { ACCENT, ICONS, PresetCard, PresetPreview } from './canvas-size/presetCards';

const ACCENT_HOVER = '#2f7ae5';

export type NewDesignModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (width: number, height: number, name: string) => Promise<void> | void;
};

export const NewDesignModal = ({ open, onClose, onCreate }: NewDesignModalProps) => {
  const [activeGroupId, setActiveGroupId] = useState(PRESET_GROUPS[0].id);
  const [query, setQuery] = useState('');
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<'size' | 'name'>('size');
  const [pending, setPending] = useState<{ width: number; height: number; name: string } | null>(
    null,
  );
  const [designName, setDesignName] = useState('');

  // Escape closes the dialog, or steps back to the picker.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (step === 'name') setStep('size');
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, step]);

  // Reset transient state each time the modal is opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveGroupId(PRESET_GROUPS[0].id);
      setStep('size');
      setPending(null);
      setDesignName('');
    }
  }, [open]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const compact = q.replace(/\s/g, '').replace(/[*x×]/g, 'x');
    return PRESET_GROUPS.map((group) => ({
      group,
      presets: group.presets.filter(
        (preset) =>
          preset.label.toLowerCase().includes(q) ||
          group.label.toLowerCase().includes(q) ||
          (group.keywords?.some((keyword) => keyword.includes(q)) ?? false) ||
          `${preset.width}x${preset.height}`.includes(compact),
      ),
    })).filter((result) => result.presets.length > 0);
  }, [query]);

  if (!open) return null;

  const activeGroup =
    PRESET_GROUPS.find((group) => group.id === activeGroupId) ?? PRESET_GROUPS[0];

  const runCreate = async (width: number, height: number, name: string) => {
    if (creating || width < 1 || height < 1) return;
    setCreating(true);
    try {
      await onCreate(width, height, name);
    } finally {
      setCreating(false);
    }
  };

  /** Step 1 → 2: remember the size and suggest a name derived from it. */
  const pickPreset = (group: PresetGroup, preset: CanvasPreset) => {
    const name = group.id === 'common' ? preset.label : `${group.label} ${preset.label}`;
    setPending({ width: preset.width, height: preset.height, name });
    setDesignName(name);
    setStep('name');
  };

  const pickCustomSize = () => {
    setPending({ width: customWidth, height: customHeight, name: 'Custom Design' });
    setDesignName('Custom Design');
    setStep('name');
  };

  const confirmCreate = () => {
    if (!pending) return;
    void runCreate(pending.width, pending.height, designName.trim() || pending.name);
  };

  const renderGroups = (groups: { group: PresetGroup; presets: CanvasPreset[] }[]) => (
    <div css={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {groups.map(({ group, presets }) => (
        <div key={group.id}>
          <h3
            css={{
              margin: '0 0 8px',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--app-text-muted)',
            }}
          >
            {group.label}
          </h3>
          <div
            css={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
            {presets.map((preset) => (
              <PresetCard
                key={`${group.id}-${preset.label}`}
                preset={preset}
                onPick={() => pickPreset(group, preset)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const navItemCss = (active: boolean) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background .15s ease, color .15s ease',
    background: active ? 'rgba(61,142,255,.12)' : 'transparent',
    color: active ? ACCENT : 'var(--app-text)',
    ':hover': active
      ? undefined
      : { background: 'var(--app-surface-2)', color: 'var(--app-text-strong)' },
  });

  const textInputCss = {
    width: '100%',
    background: 'var(--app-panel)',
    border: '1px solid var(--app-border-strong)',
    borderRadius: 8,
    color: 'var(--app-text-strong)',
    outline: 'none',
    ':focus': { borderColor: ACCENT },
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      css={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(8, 10, 18, 0.55)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a new design"
        onClick={(event) => event.stopPropagation()}
        css={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 760,
          height: 560,
          maxHeight: '85vh',
          overflow: 'hidden',
          background: 'var(--app-panel)',
          border: '1px solid var(--app-border)',
          borderRadius: 18,
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.45)',
        }}
      >
        {/* Header */}
        <div
          css={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border)',
            flex: '0 0 auto',
          }}
        >
          <div>
            <h2
              css={{
                margin: 0,
                fontSize: 15,
                fontWeight: 800,
                color: 'var(--app-text-strong)',
              }}
            >
              Create a new design
            </h2>
            <div css={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div css={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  css={{
                    height: 4,
                    width: 24,
                    borderRadius: 999,
                    background: ACCENT,
                    opacity: step === 'size' ? 1 : 0.4,
                  }}
                />
                <span
                  css={{
                    height: 4,
                    width: 24,
                    borderRadius: 999,
                    background: step === 'name' ? ACCENT : 'var(--app-surface-2)',
                  }}
                />
              </div>
              <p css={{ margin: 0, fontSize: 12, color: 'var(--app-text-muted)' }}>
                Step {step === 'size' ? '1' : '2'} of 2 &middot;{' '}
                {step === 'size' ? 'Choose a size' : 'Name your design'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            css={{
              display: 'flex',
              padding: 6,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--app-text-muted)',
              cursor: 'pointer',
              ':hover': {
                background: 'var(--app-surface-2)',
                color: 'var(--app-text-strong)',
              },
            }}
          >
            <XIcon width={16} height={16} />
          </button>
        </div>

        <div css={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Step 2 — name the design */}
          {step === 'name' && pending && (
            <div
              css={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '32px 24px',
              }}
            >
              <div
                css={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                  width: '100%',
                  maxWidth: 380,
                  margin: '0 auto',
                }}
              >
                <div
                  css={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    css={{
                      width: 64,
                      height: 64,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                      background: 'var(--app-surface)',
                      border: '1px solid var(--app-border)',
                    }}
                  >
                    <PresetPreview width={pending.width} height={pending.height} max={34} />
                  </div>
                  <div css={{ textAlign: 'center' }}>
                    <p
                      css={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--app-text-strong)',
                      }}
                    >
                      {pending.width} × {pending.height} px
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep('size')}
                      css={{
                        marginTop: 2,
                        padding: 0,
                        fontSize: 12,
                        border: 'none',
                        background: 'transparent',
                        color: ACCENT,
                        cursor: 'pointer',
                        ':hover': { textDecoration: 'underline' },
                      }}
                    >
                      Choose a different size
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="new-design-name"
                    css={{
                      display: 'block',
                      marginBottom: 4,
                      fontSize: 12,
                      color: 'var(--app-text-muted)',
                    }}
                  >
                    Design name
                  </label>
                  <input
                    id="new-design-name"
                    autoFocus
                    value={designName}
                    placeholder="Untitled Design"
                    onChange={(event) => setDesignName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') confirmCreate();
                    }}
                    onFocus={(event) => event.target.select()}
                    css={{
                      ...textInputCss,
                      fontSize: 14,
                      padding: '8px 12px',
                    }}
                  />
                  <p
                    css={{
                      margin: '6px 0 0',
                      fontSize: 11,
                      color: 'var(--app-text-muted)',
                    }}
                  >
                    Suggested from the size you picked — you can rename it any time.
                  </p>
                </div>

                <div css={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setStep('size')}
                    css={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                      border: '1px solid var(--app-border-strong)',
                      borderRadius: 8,
                      background: 'var(--app-panel)',
                      color: 'var(--app-text)',
                      cursor: 'pointer',
                      ':hover': { background: 'var(--app-surface)' },
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={creating || !designName.trim()}
                    onClick={confirmCreate}
                    css={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: 13,
                      fontWeight: 800,
                      border: 'none',
                      borderRadius: 8,
                      background: ACCENT,
                      color: '#fff',
                      cursor: 'pointer',
                      transition: 'background .15s ease',
                      ':hover': { background: ACCENT_HOVER },
                      ':disabled': {
                        opacity: 0.5,
                        cursor: 'not-allowed',
                      },
                    }}
                  >
                    {creating ? 'Creating…' : 'Create design'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Category nav (hidden while naming) */}
          {step === 'size' && (
            <aside
              css={{
                width: 170,
                flex: '0 0 auto',
                borderRight: '1px solid var(--app-border)',
                background: 'var(--app-surface)',
                overflowY: 'auto',
                paddingTop: 8,
                paddingBottom: 8,
              }}
            >
              {PRESET_GROUPS.map((group) => {
                const Icon = ICONS[group.icon] ?? SquaresFourIcon;
                const active = !searchResults && group.id === activeGroupId;
                return (
                  <button
                    key={group.id}
                    type="button"
                    css={navItemCss(active)}
                    onClick={() => {
                      setQuery('');
                      setActiveGroupId(group.id);
                    }}
                  >
                    <Icon width={15} height={15} />
                    <span
                      css={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {group.label}
                    </span>
                  </button>
                );
              })}
              <div
                css={{
                  margin: '4px 12px',
                  borderTop: '1px solid var(--app-border)',
                }}
              />
              <button
                type="button"
                css={navItemCss(!searchResults && activeGroupId === 'custom')}
                onClick={() => {
                  setQuery('');
                  setActiveGroupId('custom');
                }}
              >
                <RulerIcon width={15} height={15} />
                <span
                  css={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Custom size
                </span>
              </button>
            </aside>
          )}

          {/* Step 1 — size picker */}
          {step === 'size' && (
            <div css={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
              <div
                css={{
                  padding: 12,
                  borderBottom: '1px solid var(--app-border)',
                  flex: '0 0 auto',
                }}
              >
                <div css={{ position: 'relative' }}>
                  <MagnifyingGlassIcon
                    width={15}
                    height={15}
                    css={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--app-text-muted)',
                    }}
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search sizes (e.g. banner, story, 1080)"
                    aria-label="Search sizes"
                    css={{
                      ...textInputCss,
                      fontSize: 13,
                      padding: '8px 12px 8px 32px',
                    }}
                  />
                </div>
              </div>

              <div css={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {searchResults ? (
                  searchResults.length > 0 ? (
                    renderGroups(searchResults)
                  ) : (
                    <p
                      css={{
                        margin: 0,
                        padding: '32px 0',
                        textAlign: 'center',
                        fontSize: 13,
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      No matching sizes
                    </p>
                  )
                ) : activeGroupId === 'custom' ? (
                  <div css={{ maxWidth: 300 }}>
                    <h3
                      css={{
                        margin: '0 0 8px',
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      Custom size
                    </h3>
                    <div css={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                      <div css={{ flex: 1 }}>
                        <label
                          htmlFor="custom-width"
                          css={{
                            display: 'block',
                            marginBottom: 4,
                            fontSize: 12,
                            color: 'var(--app-text-muted)',
                          }}
                        >
                          Width
                        </label>
                        <input
                          id="custom-width"
                          type="number"
                          min={1}
                          value={customWidth}
                          onChange={(event) => setCustomWidth(Number(event.target.value) || 0)}
                          css={{ ...textInputCss, fontSize: 13, padding: '6px 8px' }}
                        />
                      </div>
                      <span
                        css={{
                          paddingBottom: 8,
                          fontSize: 13,
                          color: 'var(--app-text-muted)',
                        }}
                      >
                        ×
                      </span>
                      <div css={{ flex: 1 }}>
                        <label
                          htmlFor="custom-height"
                          css={{
                            display: 'block',
                            marginBottom: 4,
                            fontSize: 12,
                            color: 'var(--app-text-muted)',
                          }}
                        >
                          Height
                        </label>
                        <input
                          id="custom-height"
                          type="number"
                          min={1}
                          value={customHeight}
                          onChange={(event) => setCustomHeight(Number(event.target.value) || 0)}
                          css={{ ...textInputCss, fontSize: 13, padding: '6px 8px' }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={creating || customWidth < 1 || customHeight < 1}
                      onClick={pickCustomSize}
                      css={{
                        marginTop: 12,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        padding: '8px 12px',
                        fontSize: 13,
                        fontWeight: 800,
                        border: 'none',
                        borderRadius: 8,
                        background: ACCENT,
                        color: '#fff',
                        cursor: 'pointer',
                        ':hover': { background: ACCENT_HOVER },
                        ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
                      }}
                    >
                      Continue with {customWidth} × {customHeight}
                    </button>
                  </div>
                ) : (
                  renderGroups([{ group: activeGroup, presets: activeGroup.presets }])
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewDesignModal;
