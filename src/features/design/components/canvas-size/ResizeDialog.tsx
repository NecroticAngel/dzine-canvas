import MagnifyingGlassIcon from '@duyank/icons/regular/MagnifyingGlass';
import XIcon from '@duyank/icons/regular/X';
import { type FC, useMemo, useState } from 'react';
import { PRESET_GROUPS } from '../../config/canvasPresets';
import { ACCENT, ICONS, PresetCard } from './presetCards';

interface ResizeDialogProps {
  current: { width: number; height: number };
  /** How many pages the resize will touch, so the warning is specific. */
  pageCount: number;
  onClose: () => void;
  onResize: (width: number, height: number) => void;
}

const MIN_SIDE = 20;
const MAX_SIDE = 10000;

/**
 * Change the canvas size and re-lay-out the design for it.
 *
 * The explanation is part of the interface rather than a tooltip: magic resize
 * is a guess about intent, and a user who cannot see the rules cannot tell a
 * good result from a broken one. Every page is resized, not just the visible
 * one — a design whose pages disagree about their size is one nobody can export.
 */
export const ResizeDialog: FC<ResizeDialogProps> = ({
  current,
  pageCount,
  onClose,
  onResize,
}) => {
  const [activeGroupId, setActiveGroupId] = useState(PRESET_GROUPS[0].id);
  const [query, setQuery] = useState('');
  const [customWidth, setCustomWidth] = useState(current.width);
  const [customHeight, setCustomHeight] = useState(current.height);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return PRESET_GROUPS.flatMap((group) =>
      group.presets.filter(
        (preset) =>
          preset.label.toLowerCase().includes(needle) ||
          group.label.toLowerCase().includes(needle) ||
          (group.keywords ?? []).some((word) =>
            word.toLowerCase().includes(needle),
          ),
      ),
    );
  }, [query]);

  const activeGroup =
    PRESET_GROUPS.find((group) => group.id === activeGroupId) ?? PRESET_GROUPS[0];
  const shown = searchResults ?? activeGroup.presets;

  const same =
    customWidth === current.width && customHeight === current.height;
  const customValid =
    Number.isFinite(customWidth) &&
    Number.isFinite(customHeight) &&
    customWidth >= MIN_SIDE &&
    customWidth <= MAX_SIDE &&
    customHeight >= MIN_SIDE &&
    customHeight <= MAX_SIDE;

  const fieldCss = {
    width: 100,
    border: '1px solid var(--app-border-strong)',
    background: 'var(--app-surface)',
    color: 'var(--app-text-strong)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    ':focus': { borderColor: ACCENT },
  } as const;

  return (
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
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Resize design"
        css={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--app-panel)',
          border: '1px solid var(--app-border-strong)',
          borderRadius: 12,
          boxShadow: '0 18px 40px rgba(0,0,0,.45)',
          color: 'var(--app-text)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border)',
          }}
        >
          <div css={{ flexGrow: 1 }}>
            <div
              css={{ fontWeight: 700, fontSize: 16, color: 'var(--app-text-strong)' }}
            >
              Resize design
            </div>
            <div css={{ fontSize: 12, color: 'var(--app-text-muted)', marginTop: 2 }}>
              Currently {current.width} × {current.height}
              {pageCount > 1 ? ` · all ${pageCount} pages` : ''}
            </div>
          </div>
          <div
            css={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              cursor: 'pointer',
              borderRadius: 6,
              ':hover': { background: 'var(--app-surface)' },
            }}
            onClick={onClose}
          >
            <XIcon />
          </div>
        </div>

        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px 0',
          }}
        >
          <div
            css={{
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid var(--app-border-strong)',
              background: 'var(--app-surface)',
              borderRadius: 8,
              padding: '7px 10px',
            }}
          >
            <MagnifyingGlassIcon width={16} height={16} />
            <input
              value={query}
              aria-label="Search sizes"
              placeholder="Search sizes…"
              onChange={(event) => setQuery(event.target.value)}
              css={{
                flexGrow: 1,
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--app-text-strong)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {!searchResults && (
          <div
            css={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              padding: '12px 20px 0',
            }}
          >
            {PRESET_GROUPS.map((group) => {
              const Icon = ICONS[group.icon];
              const active = group.id === activeGroup.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  css={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    border: `1px solid ${active ? ACCENT : 'var(--app-border)'}`,
                    background: active ? 'rgba(61,142,255,.16)' : 'transparent',
                    color: active ? ACCENT : 'var(--app-text)',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {Icon ? <Icon width={14} height={14} /> : null}
                  {group.label}
                </button>
              );
            })}
          </div>
        )}

        <div
          css={{
            flexGrow: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))',
            gap: 10,
            padding: 20,
          }}
        >
          {shown.map((preset) => (
            <PresetCard
              key={`${preset.label}-${preset.width}x${preset.height}`}
              preset={preset}
              onPick={() => onResize(preset.width, preset.height)}
            />
          ))}
          {searchResults && searchResults.length === 0 && (
            <p css={{ margin: 0, fontSize: 13, color: 'var(--app-text-muted)' }}>
              No sizes match that.
            </p>
          )}
        </div>

        <div
          css={{
            borderTop: '1px solid var(--app-border)',
            padding: '14px 20px',
          }}
        >
          <div
            css={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <label
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-muted)',
              }}
            >
              Width
              <input
                type="number"
                aria-label="Custom width"
                value={customWidth}
                min={MIN_SIDE}
                max={MAX_SIDE}
                onChange={(event) => setCustomWidth(Number(event.target.value))}
                css={fieldCss}
              />
            </label>
            <label
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-muted)',
              }}
            >
              Height
              <input
                type="number"
                aria-label="Custom height"
                value={customHeight}
                min={MIN_SIDE}
                max={MAX_SIDE}
                onChange={(event) => setCustomHeight(Number(event.target.value))}
                css={fieldCss}
              />
            </label>
            <button
              type="button"
              disabled={!customValid || same}
              css={{
                border: 'none',
                background: ACCENT,
                color: '#fff',
                borderRadius: 8,
                padding: '10px 18px',
                fontWeight: 700,
                fontSize: 13,
                cursor: customValid && !same ? 'pointer' : 'not-allowed',
                opacity: customValid && !same ? 1 : 0.5,
              }}
              onClick={() => onResize(customWidth, customHeight)}
            >
              Resize
            </button>
            <span css={{ fontSize: 12, color: 'var(--app-text-muted)' }}>
              {same
                ? 'That is the current size.'
                : !customValid
                  ? `Between ${MIN_SIDE} and ${MAX_SIDE} px.`
                  : ''}
            </span>
          </div>
          <p
            css={{
              margin: '12px 0 0',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--app-text-muted)',
            }}
          >
            Layers are re-laid-out, not stretched: positions follow the new
            proportions on each axis, sizes stay in proportion so nothing is
            squashed, and text scales with its box. A layer that covered the page
            is stretched to cover the new one. Undo puts it all back.
          </p>
        </div>
      </div>
    </div>
  );
};
