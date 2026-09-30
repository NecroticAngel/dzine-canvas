import XIcon from '@duyank/icons/regular/X';
import { useEditor, useSelectedLayers } from '@lidojs/design-editor';
import axios from 'axios';
import { type FC, useEffect, useState } from 'react';
import { fontFamilies } from '../../../../utils/fonts';
import { type Session, fetchSession } from '../../../../utils/session';

type BrandKit = {
  colours: string[];
  fonts: string[];
  updatedAt: number | null;
  updatedBy: string | null;
};

/**
 * The tenant's brand colours and fonts, one click from any design.
 *
 * A brand kit is worth saving only because it is shared, so the kit belongs to
 * the tenant and lives on the server rather than in the browser of whoever set
 * it up. Editing is therefore admin-only — the same rule as publishing a
 * template — while everyone can read and apply it.
 *
 * Applying is a click on the swatch or the font, which is the whole point: the
 * value of a brand kit is not the list, it is not having to remember a hex.
 */
export const BrandContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { actions, pages, activePage } = useEditor();
  const { selectedLayerIds } = useSelectedLayers();

  const [kit, setKit] = useState<BrandKit | null>(null);
  const [failed, setFailed] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandKit | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newColour, setNewColour] = useState('#3d8eff');
  const [newFont, setNewFont] = useState('');

  useEffect(() => {
    let cancelled = false;
    void axios
      .get<BrandKit>('/brand')
      .then((response) => {
        if (!cancelled) setKit(response.data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    void fetchSession().then((value) => {
      if (!cancelled) setSession(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** The one selected layer, if there is exactly one — the target for an apply. */
  const target = (() => {
    if (selectedLayerIds.length !== 1) return null;
    const layer = pages[activePage]?.layers?.[selectedLayerIds[0]];
    return layer
      ? { id: selectedLayerIds[0], name: layer.type?.resolvedName ?? '' }
      : null;
  })();

  /**
   * Which prop carries a colour, by layer type.
   *
   * Table cells are deliberately absent: their colours live per cell rather than
   * on the layer, and applying to "the whole table" would not be what anybody
   * meant by clicking a swatch.
   */
  const colourTarget = (() => {
    if (!target) return null;
    if (target.name === 'TextLayer') return { prop: 'color', text: true };
    if (target.name === 'ShapeLayer' || target.name === 'LineLayer') {
      return { prop: 'color', text: false };
    }
    if (target.name === 'QrCodeLayer') return { prop: 'textColor', text: false };
    return null;
  })();

  /**
   * Copy a value, or say so plainly.
   *
   * A `window.prompt` fallback would block the whole editor mid-click, which is
   * a far worse outcome than a value the user has to select by hand — the swatch
   * already carries the hex in its tooltip, so the notice reports it instead.
   */
  const copyToClipboard = (value: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value).catch(() => {
        setNotice(`Could not copy — the value is ${value}`);
      });
      return;
    }
    setNotice(`Could not copy — the value is ${value}`);
  };

  const applyColour = (colour: string) => {
    if (!target || !colourTarget) {
      copyToClipboard(colour);
      setNotice(`${colour} copied`);
      return;
    }
    if (colourTarget.text) actions.updateTextAttrs(target.id, { color: colour });
    else actions.updateLayerProps(target.id, { [colourTarget.prop]: colour });
    setNotice(`${colour} applied`);
  };

  const applyFont = (family: string) => {
    if (target?.name !== 'TextLayer') {
      setNotice('Select a text layer to apply a font');
      return;
    }
    actions.updateTextAttrs(target.id, { fontFamily: family });
    setNotice(`${family} applied`);
  };

  const startEditing = () => {
    setDraft(kit ? { ...kit } : { colours: [], fonts: [], updatedAt: null, updatedBy: null });
    setNotice(null);
    setEditing(true);
  };

  const save = () => {
    if (!draft || busy) return;
    setBusy(true);
    void axios
      .put<BrandKit>('/brand', { colours: draft.colours, fonts: draft.fonts })
      .then((response) => {
        setKit(response.data);
        setDraft(response.data);
        setEditing(false);
        setNotice('Brand kit saved');
      })
      .catch((error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        setNotice(
          status === 403
            ? 'Only an administrator can change the brand kit'
            : 'Could not save the brand kit',
        );
      })
      .finally(() => setBusy(false));
  };

  const catalogue = fontFamilies();
  const shown = editing ? draft : kit;

  const swatchCss = {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: '1px solid var(--app-border-strong)',
    cursor: 'pointer',
    position: 'relative' as const,
    padding: 0,
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
          height: 48,
          flexShrink: 0,
          padding: '0 20px',
          borderBottom: '1px solid var(--app-border)',
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
          Brand
        </p>
        {session?.isAdmin && !editing && kit && (
          <button
            type="button"
            css={{
              border: '1px solid var(--app-border)',
              background: 'transparent',
              color: 'var(--app-text-strong)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              marginRight: 8,
            }}
            onClick={startEditing}
          >
            Edit
          </button>
        )}
        <div
          css={{
            fontSize: 20,
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
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: 16,
        }}
      >
        {failed && (
          <p css={{ margin: 0, fontSize: 13, color: 'var(--app-text-muted)' }}>
            Could not load the brand kit.
          </p>
        )}

        {!failed && !shown && (
          <p css={{ margin: 0, fontSize: 13, color: 'var(--app-text-muted)' }}>
            Loading…
          </p>
        )}

        {shown && (
          <>
            <section>
              <h3
                css={{
                  margin: '0 0 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--app-text-muted)',
                }}
              >
                Colours
              </h3>
              {shown.colours.length === 0 ? (
                <p
                  css={{
                    margin: 0,
                    fontSize: 13,
                    color: 'var(--app-text-muted)',
                  }}
                >
                  {session?.isAdmin
                    ? 'No brand colours yet. Add some and they will be here for the whole team.'
                    : 'No brand colours have been set up for this workspace.'}
                </p>
              ) : (
                <div
                  css={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill,minmax(34px,1fr))',
                    gap: 8,
                  }}
                >
                  {shown.colours.map((colour) => (
                    <div key={colour} css={{ position: 'relative' }}>
                      <button
                        type="button"
                        aria-label={`Brand colour ${colour}`}
                        title={
                          colourTarget
                            ? `Apply ${colour}`
                            : `Copy ${colour}`
                        }
                        css={{ ...swatchCss, background: colour }}
                        onClick={() => (editing ? undefined : applyColour(colour))}
                      />
                      {editing && (
                        <button
                          type="button"
                          aria-label={`Remove ${colour}`}
                          title="Remove"
                          css={{
                            position: 'absolute',
                            top: -6,
                            right: -6,
                            width: 16,
                            height: 16,
                            padding: 0,
                            borderRadius: '50%',
                            border: '1px solid var(--app-border-strong)',
                            background: 'var(--app-panel)',
                            color: 'var(--app-text-strong)',
                            fontSize: 10,
                            lineHeight: 1,
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    colours: current.colours.filter(
                                      (entry) => entry !== colour,
                                    ),
                                  }
                                : current,
                            )
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {editing && draft && (
                <div
                  css={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <input
                    type="color"
                    aria-label="New brand colour"
                    value={newColour}
                    onChange={(event) => setNewColour(event.target.value)}
                    css={{
                      width: 34,
                      height: 34,
                      padding: 0,
                      border: '1px solid var(--app-border-strong)',
                      borderRadius: 8,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                  <button
                    type="button"
                    css={{
                      border: '1px solid var(--app-border)',
                      background: 'transparent',
                      color: 'var(--app-text-strong)',
                      borderRadius: 8,
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      setDraft((current) =>
                        current && !current.colours.includes(newColour)
                          ? {
                              ...current,
                              colours: [...current.colours, newColour],
                            }
                          : current,
                      )
                    }
                  >
                    Add colour
                  </button>
                </div>
              )}
            </section>

            <section>
              <h3
                css={{
                  margin: '0 0 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--app-text-muted)',
                }}
              >
                Fonts
              </h3>
              {shown.fonts.length === 0 ? (
                <p
                  css={{
                    margin: 0,
                    fontSize: 13,
                    color: 'var(--app-text-muted)',
                  }}
                >
                  {session?.isAdmin
                    ? 'No brand fonts yet.'
                    : 'No brand fonts have been set up for this workspace.'}
                </p>
              ) : (
                <ul
                  css={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {shown.fonts.map((family) => (
                    <li
                      key={family}
                      css={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <button
                        type="button"
                        aria-label={`Brand font ${family}`}
                        title={`Apply ${family} to the selected text`}
                        css={{
                          flexGrow: 1,
                          textAlign: 'left',
                          border: '1px solid var(--app-border)',
                          background: 'var(--app-surface)',
                          color: 'var(--app-text-strong)',
                          borderRadius: 8,
                          padding: '9px 11px',
                          // Shown in its own face: the list doubles as proof the
                          // family is available rather than merely remembered.
                          fontFamily: family,
                          fontSize: 16,
                          cursor: editing ? 'default' : 'pointer',
                        }}
                        onClick={() => (editing ? undefined : applyFont(family))}
                      >
                        {family}
                      </button>
                      {editing && (
                        <button
                          type="button"
                          aria-label={`Remove ${family}`}
                          title="Remove"
                          css={{
                            border: '1px solid var(--app-border)',
                            background: 'transparent',
                            color: 'var(--app-text-muted)',
                            borderRadius: 8,
                            width: 28,
                            height: 28,
                            cursor: 'pointer',
                          }}
                          onClick={() =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    fonts: current.fonts.filter(
                                      (entry) => entry !== family,
                                    ),
                                  }
                                : current,
                            )
                          }
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editing && draft && (
                <div
                  css={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <select
                    aria-label="New brand font"
                    value={newFont}
                    onChange={(event) => setNewFont(event.target.value)}
                    css={{
                      flexGrow: 1,
                      minWidth: 0,
                      border: '1px solid var(--app-border-strong)',
                      background: 'var(--app-surface)',
                      color: 'var(--app-text-strong)',
                      borderRadius: 8,
                      padding: '7px 9px',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Choose a font…</option>
                    {catalogue
                      .filter((family) => !draft.fonts.includes(family))
                      .map((family) => (
                        <option key={family} value={family}>
                          {family}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!newFont}
                    css={{
                      border: '1px solid var(--app-border)',
                      background: 'transparent',
                      color: 'var(--app-text-strong)',
                      borderRadius: 8,
                      padding: '7px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: newFont ? 'pointer' : 'not-allowed',
                      opacity: newFont ? 1 : 0.5,
                    }}
                    onClick={() => {
                      if (!newFont) return;
                      setDraft((current) =>
                        current
                          ? { ...current, fonts: [...current.fonts, newFont] }
                          : current,
                      );
                      setNewFont('');
                    }}
                  >
                    Add font
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {editing && draft && (
          <div css={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={busy}
              css={{
                flexGrow: 1,
                border: 'none',
                background: '#3d8eff',
                color: '#fff',
                borderRadius: 8,
                padding: '10px 14px',
                fontWeight: 700,
                fontSize: 13,
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save brand kit'}
            </button>
            <button
              type="button"
              css={{
                border: '1px solid var(--app-border)',
                background: 'transparent',
                color: 'var(--app-text)',
                borderRadius: 8,
                padding: '10px 14px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
              onClick={() => {
                setEditing(false);
                setDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {notice && (
          <p
            css={{
              margin: 0,
              fontSize: 12,
              color: 'var(--app-text-muted)',
            }}
          >
            {notice}
          </p>
        )}

        {!editing && shown && (
          <p css={{ margin: 0, fontSize: 12, color: 'var(--app-text-muted)' }}>
            {colourTarget
              ? 'Click a colour to apply it to the selected layer.'
              : 'Click a colour to copy it. Select one text or shape layer to apply instead.'}
          </p>
        )}
      </div>
    </div>
  );
};
