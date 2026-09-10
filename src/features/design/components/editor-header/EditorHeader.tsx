import ArrowClockwiseIcon from '@duyank/icons/regular/ArrowClockwise';
import ArrowCounterClockwiseIcon from '@duyank/icons/regular/ArrowCounterClockwise';
import GithubLogoIcon from '@duyank/icons/regular/GithubLogo';
import PlayCircleIcon from '@duyank/icons/regular/PlayCircle';
import { useEditor } from '@lidojs/design-editor';
import {
  type ChangeEvent,
  type FormEvent,
  type ForwardRefRenderFunction,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import { downloadObjectAsJson } from '../../../../utils/download';
import { safeFileName } from '../../../../utils/designLibrary';
import {
  exportDesign,
  type ExportFormat,
} from '../../../../utils/exportDesign';
import { useAppTheme } from '../../../../shared/theme';

interface HeaderLayoutProps {
  openPreview: () => void;
  onBackHome?: () => void;
}

type NameDialogState =
  | { mode: 'new'; title: string; initial: string }
  | { mode: 'rename'; id: string; title: string; initial: string }
  | { mode: 'save'; title: string; initial: string };

const EXPORT_OPTIONS: { format: ExportFormat; label: string; hint: string }[] =
  [
    { format: 'png', label: 'PNG', hint: 'Image' },
    { format: 'jpg', label: 'JPG', hint: 'Image' },
    { format: 'pdf', label: 'PDF', hint: 'Document' },
    { format: 'json', label: 'JSON', hint: 'Editable backup' },
  ];

const menuPanelCss = {
  position: 'absolute' as const,
  top: 'calc(100% + 10px)',
  right: 0,
  minWidth: 260,
  background: '#2a2a3d',
  border: '1px solid #3a3a4c',
  borderRadius: 10,
  padding: 6,
  boxShadow: '0 12px 28px rgba(0,0,0,.35)',
  zIndex: 50,
};

const menuItemCss = {
  display: 'flex' as const,
  width: '100%',
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  gap: 12,
  border: 'none',
  background: 'transparent',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
  textAlign: 'left' as const,
  ':hover': {
    background: 'rgba(61,142,255,.18)',
  },
};

const EditorHeaderForwardRef: ForwardRefRenderFunction<
  HTMLDivElement,
  HeaderLayoutProps
> = ({ openPreview, onBackHome }, ref) => {
  const importRef = useRef<HTMLInputElement>(null);
  const openFileRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const filesMenuRef = useRef<HTMLDivElement>(null);
  const { actions, query, currentDesign, designs } = useEditor();
  const { mode, toggleMode } = useAppTheme();
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [exportOpen, setExportOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!exportOpen && !filesOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (exportOpen && !exportMenuRef.current?.contains(target)) {
        setExportOpen(false);
      }
      if (filesOpen && !filesMenuRef.current?.contains(target)) {
        setFilesOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [exportOpen, filesOpen]);

  useEffect(() => {
    if (!nameDialog) return;
    setNameDraft(nameDialog.initial);
    const frame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [nameDialog]);

  const openNameDialog = (next: NameDialogState) => {
    setFilesOpen(false);
    setExportOpen(false);
    setNameDialog(next);
  };

  const handleExport = async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(true);
    setExportOpen(false);
    try {
      actions.selectLayers([]);
      actions.setEditingLayer(null);
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
      const pageIndex = query.activePage();
      const pageSize = query.getPageSize(pageIndex);
      const base = safeFileName(currentDesign?.name ?? 'dzine-canvas');
      await exportDesign({
        format,
        pageIndex,
        pageSize,
        pages: query.serialize(),
        fileName: base,
      });
    } catch (error) {
      console.error(error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'Export failed. Please try again.',
      );
    } finally {
      setExporting(false);
    }
  };

  const finishSave = (name: string) => {
    const currentName = currentDesign?.name ?? 'Untitled';
    const trimmed = name.trim() || currentName;
    if (currentDesign && trimmed !== currentName) {
      actions.renameDesign(currentDesign.id, trimmed);
    }
    actions.saveDesign();
    setSaveState('saved');
    window.setTimeout(() => setSaveState('idle'), 1500);
  };

  const handleSave = () => {
    openNameDialog({
      mode: 'save',
      title: 'Save design as',
      initial: currentDesign?.name ?? 'Untitled',
    });
  };

  const handleNameDialogSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!nameDialog) return;
    const trimmed = nameDraft.trim();
    if (nameDialog.mode === 'new') {
      actions.newDesign(trimmed || undefined);
    } else if (nameDialog.mode === 'rename') {
      if (!trimmed) return;
      actions.renameDesign(nameDialog.id, trimmed);
    } else {
      finishSave(trimmed);
    }
    setNameDialog(null);
  };

  const parseDesignFile = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed) || !parsed[0] || typeof parsed[0] !== 'object') {
      throw new Error('Invalid design file. Expected a D-Zine Canvas JSON export.');
    }
    return parsed as Parameters<typeof actions.importDesignFile>[0];
  };

  const handleImportIntoCurrent = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const pages = await parseDesignFile(file);
      actions.setData(pages);
      actions.saveDesign();
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1500);
    } catch (error) {
      console.error(error);
      window.alert(
        error instanceof Error ? error.message : 'Could not import that file.',
      );
    }
  };

  const handleOpenFromComputer = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const pages = await parseDesignFile(file);
      const name = file.name.replace(/\.json$/i, '') || 'Imported design';
      actions.importDesignFile(pages, name);
      setFilesOpen(false);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1500);
    } catch (error) {
      console.error(error);
      window.alert(
        error instanceof Error ? error.message : 'Could not open that file.',
      );
    }
  };

  const handleSaveToComputer = () => {
    actions.saveDesign();
    const base = safeFileName(currentDesign?.name ?? 'dzine-canvas');
    downloadObjectAsJson(base, query.serialize());
    setFilesOpen(false);
  };

  const handleNewDesign = () => {
    openNameDialog({
      mode: 'new',
      title: 'Name your new design',
      initial: '',
    });
  };

  const handleRename = (id: string, currentName: string) => {
    openNameDialog({
      mode: 'rename',
      id,
      title: 'Rename design',
      initial: currentName,
    });
  };

  const handleRenameCurrent = () => {
    if (!currentDesign) return;
    handleRename(currentDesign.id, currentDesign.name);
  };

  const handleDelete = (id: string, name: string) => {
    if (designs.length <= 1) {
      window.alert('Keep at least one design in the library.');
      return;
    }
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    actions.deleteDesign(id);
  };

  const formatUpdated = (ts: number) => {
    try {
      return new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div
      ref={ref}
      css={{
        background: '#1E1E2D',
        padding: '12px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        '@media (max-width: 900px)': {
          padding: 12,
        },
      }}
    >
      <div css={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <div
          css={{
            color: 'white',
            height: 42,
            width: 160,
            paddingTop: 6,
            paddingBottom: 6,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            title={onBackHome ? 'Back to designs' : undefined}
            css={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: onBackHome ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (!onBackHome) return;
              actions.saveDesign();
              onBackHome();
            }}
          >
            <img
              alt="D-Zine Canvas"
              css={{
                width: '100%',
                height: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                objectPosition: 'left center',
              }}
              src="./assets/dzine_canvas.png"
            />
          </button>
        </div>
        {onBackHome && (
          <button
            type="button"
            css={{
              border: '1px solid #3a3a4c',
              background: 'transparent',
              color: '#c8cce0',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
              ':hover': { color: '#fff', background: '#2a2a3d' },
              '@media (max-width: 900px)': {
                display: 'none',
              },
            }}
            onClick={() => {
              actions.saveDesign();
              onBackHome();
            }}
          >
            Designs
          </button>
        )}
        <div
          ref={filesMenuRef}
          css={{
            position: 'relative',
            minWidth: 0,
            '@media (max-width: 900px)': {
              display: 'none',
            },
          }}
        >
          <button
            type="button"
            title="Open Files menu. Double-click the name to rename."
            css={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              maxWidth: 280,
              border: '1px solid #3a3a4c',
              background: '#2a2a3d',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              ':hover': {
                background: '#34344a',
              },
            }}
            onClick={() => {
              setExportOpen(false);
              setFilesOpen((open) => !open);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleRenameCurrent();
            }}
          >
            <span
              css={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentDesign?.name ?? 'Untitled'}
            </span>
            <span css={{ color: '#9aa0b5', fontSize: 12 }}>Files ▾</span>
          </button>
          {filesOpen && (
            <div css={menuPanelCss}>
              <div
                css={{
                  padding: '8px 12px 6px',
                  color: '#9aa0b5',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                My Designs
              </div>
              <button
                type="button"
                css={menuItemCss}
                onClick={handleRenameCurrent}
              >
                <span>Rename…</span>
                <span css={{ color: '#9aa0b5', fontWeight: 500, fontSize: 12 }}>
                  {currentDesign?.name ?? 'Untitled'}
                </span>
              </button>
              <div
                css={{
                  height: 1,
                  background: '#3a3a4c',
                  margin: '4px 6px 6px',
                }}
              />
              <div css={{ maxHeight: 220, overflowY: 'auto', marginBottom: 4 }}>
                {designs.map((design) => {
                  const active = design.id === currentDesign?.id;
                  return (
                    <div
                      key={design.id}
                      css={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        borderRadius: 8,
                        background: active
                          ? 'rgba(61,142,255,.18)'
                          : 'transparent',
                        padding: 2,
                      }}
                    >
                      <button
                        type="button"
                        css={{
                          ...menuItemCss,
                          flex: 1,
                          padding: '8px 10px',
                          background: 'transparent',
                          ':hover': {
                            background: active
                              ? 'transparent'
                              : 'rgba(61,142,255,.12)',
                          },
                        }}
                        onClick={() => {
                          actions.openDesign(design.id);
                          setFilesOpen(false);
                        }}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleRename(design.id, design.name);
                        }}
                      >
                        <span
                          css={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {design.name}
                        </span>
                        <span
                          css={{
                            color: '#9aa0b5',
                            fontWeight: 500,
                            fontSize: 11,
                            flexShrink: 0,
                          }}
                        >
                          {formatUpdated(design.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        title="Rename"
                        aria-label={`Rename ${design.name}`}
                        css={{
                          border: 'none',
                          background: 'transparent',
                          color: '#9aa0b5',
                          cursor: 'pointer',
                          padding: '6px 4px',
                          borderRadius: 6,
                          fontSize: 12,
                          ':hover': { color: '#fff', background: '#3a3a4c' },
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRename(design.id, design.name);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title="Duplicate"
                        css={{
                          border: 'none',
                          background: 'transparent',
                          color: '#9aa0b5',
                          cursor: 'pointer',
                          padding: '6px 4px',
                          borderRadius: 6,
                          fontSize: 12,
                          ':hover': { color: '#fff', background: '#3a3a4c' },
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          actions.duplicateDesign(design.id);
                          setFilesOpen(false);
                        }}
                      >
                        ⎘
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        css={{
                          border: 'none',
                          background: 'transparent',
                          color: '#9aa0b5',
                          cursor: 'pointer',
                          padding: '6px 6px',
                          borderRadius: 6,
                          fontSize: 12,
                          ':hover': { color: '#ff8f8f', background: '#3a3a4c' },
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(design.id, design.name);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <div
                css={{
                  height: 1,
                  background: '#3a3a4c',
                  margin: '4px 6px 6px',
                }}
              />
              <button type="button" css={menuItemCss} onClick={handleNewDesign}>
                <span>New design…</span>
              </button>
              <button
                type="button"
                css={menuItemCss}
                onClick={() => openFileRef.current?.click()}
              >
                <span>Open from computer</span>
                <span css={{ color: '#9aa0b5', fontWeight: 500, fontSize: 12 }}>
                  JSON
                </span>
              </button>
              <button
                type="button"
                css={menuItemCss}
                onClick={handleSaveToComputer}
              >
                <span>Save to computer</span>
                <span css={{ color: '#9aa0b5', fontWeight: 500, fontSize: 12 }}>
                  JSON
                </span>
              </button>
              <input
                ref={openFileRef}
                accept="application/json,.json"
                css={{ display: 'none' }}
                type="file"
                onChange={handleOpenFromComputer}
              />
            </div>
          )}
        </div>
      </div>
      <div css={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <div css={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            css={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: '#3a3a4c',
              width: 36,
              height: 36,
              borderRadius: '50%',
              cursor: query.history.canUndo() ? 'pointer' : undefined,
              opacity: query.history.canUndo() ? 1 : 0.5,
              ':hover': {
                background: query.history.canUndo()
                  ? 'rgba(58,58,76,0.5)'
                  : undefined,
              },
            }}
            onClick={actions.history.undo}
          >
            <ArrowCounterClockwiseIcon />
          </div>
          <div
            css={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: '#3a3a4c',
              width: 36,
              height: 36,
              borderRadius: '50%',
              cursor: query.history.canRedo() ? 'pointer' : undefined,
              opacity: query.history.canRedo() ? 1 : 0.5,
              ':hover': {
                background: query.history.canRedo()
                  ? 'rgba(58,58,76,0.5)'
                  : undefined,
              },
            }}
            onClick={actions.history.redo}
          >
            <ArrowClockwiseIcon />
          </div>
        </div>
        <a
          href="https://github.com/NecroticAngel/dzine-canvas"
          rel="noreferrer"
          target="_blank"
        >
          <span
            css={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: '#3a3a4c',
              width: 36,
              height: 36,
              borderRadius: '50%',
              cursor: 'pointer',
              ':hover': {
                background: 'rgba(58,58,76,0.5)',
              },
            }}
          >
            <GithubLogoIcon />
          </span>
        </a>
        <div
          css={{
            cursor: 'pointer',
            color: '#fff',
            fontWeight: 700,
            ':hover': {
              textDecoration: 'underline',
            },
            '@media (max-width: 900px)': {
              display: 'none',
            },
          }}
          onClick={() => importRef.current?.click()}
          title="Replace the current design with a JSON file"
        >
          <input
            ref={importRef}
            accept="application/json,.json"
            css={{ display: 'none' }}
            type="file"
            onChange={handleImportIntoCurrent}
          />
          Import
        </div>
        <div
          ref={exportMenuRef}
          css={{
            position: 'relative',
            '@media (max-width: 900px)': {
              display: 'none',
            },
          }}
        >
          <div
            css={{
              cursor: exporting ? 'wait' : 'pointer',
              color: '#fff',
              fontWeight: 700,
              opacity: exporting ? 0.7 : 1,
              ':hover': {
                textDecoration: exporting ? undefined : 'underline',
              },
            }}
            onClick={() => {
              if (!exporting) {
                setFilesOpen(false);
                setExportOpen((open) => !open);
              }
            }}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </div>
          {exportOpen && (
            <div css={{ ...menuPanelCss, minWidth: 180 }}>
              {EXPORT_OPTIONS.map((option) => (
                <button
                  key={option.format}
                  type="button"
                  css={menuItemCss}
                  onClick={() => handleExport(option.format)}
                >
                  <span>{option.label}</span>
                  <span
                    css={{ color: '#9aa0b5', fontWeight: 500, fontSize: 12 }}
                  >
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          css={{
            cursor: 'pointer',
            color: '#fff',
            fontWeight: 700,
            background: '#3a3a4c',
            padding: '8px 14px',
            borderRadius: 8,
            ':hover': {
              background: 'rgba(58,58,76,0.5)',
            },
            '@media (max-width: 900px)': {
              display: 'none',
            },
          }}
          onClick={toggleMode}
          title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {mode === 'dark' ? 'Light' : 'Dark'}
        </div>
        <div
          css={{
            cursor: 'pointer',
            color: saveState === 'saved' ? '#e8fff6' : '#fff',
            fontWeight: 700,
            background: saveState === 'saved' ? '#1f9d6a' : '#3d8eff',
            padding: '8px 14px',
            borderRadius: 8,
            ':hover': {
              background: saveState === 'saved' ? '#1f9d6a' : '#2f7ae5',
            },
            '@media (max-width: 900px)': {
              display: 'none',
            },
          }}
          onClick={handleSave}
        >
          {saveState === 'saved' ? 'Saved' : 'Save'}
        </div>
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            color: '#fff',
            lineHeight: 1,
            background: '#3a3a4c',
            padding: '8px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            ':hover': {
              background: 'rgba(58,58,76,0.5)',
            },
            '@media (max-width: 900px)': {
              display: 'none',
            },
          }}
          onClick={openPreview}
        >
          <div css={{ marginRight: 4, fontSize: 20 }}>
            <PlayCircleIcon />
          </div>
          Preview
        </div>
      </div>
      {nameDialog && (
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
          onClick={() => setNameDialog(null)}
        >
          <form
            css={{
              width: '100%',
              maxWidth: 380,
              background: '#2a2a3d',
              border: '1px solid #3a3a4c',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 18px 40px rgba(0,0,0,.45)',
            }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleNameDialogSubmit}
          >
            <div
              css={{
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
                marginBottom: 12,
              }}
            >
              {nameDialog.title}
            </div>
            <input
              ref={nameInputRef}
              value={nameDraft}
              placeholder="e.g. Cover page"
              css={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #4a4a60',
                background: '#1e1e2d',
                color: '#fff',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
                outline: 'none',
                ':focus': {
                  borderColor: '#3d8eff',
                },
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
                  border: '1px solid #4a4a60',
                  background: 'transparent',
                  color: '#c8cce0',
                  borderRadius: 8,
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => setNameDialog(null)}
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
                {nameDialog.mode === 'new'
                  ? 'Create'
                  : nameDialog.mode === 'save'
                    ? 'Save'
                    : 'Rename'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const EditorHeader = forwardRef(EditorHeaderForwardRef);
