import {
  LayerSettings as EditorLayerSettings,
  useSelectedLayers,
} from '@lidojs/design-editor';

export const LayerSettings = () => {
  const { selectedLayerIds } = useSelectedLayers();
  return (
    <div
      css={{
        background: 'var(--app-panel)',
        borderBottom: '1px solid var(--app-border)',
        color: 'var(--app-text)',
        height: 50,
        overflowX: 'auto',
        flexShrink: 0,
        '@media (max-width: 900px)': {
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--app-panel)',
          display: selectedLayerIds.length > 0 ? 'flex' : 'none',
          justifyContent: 'center',
          zIndex: 20,
          height: 72,
        },
      }}
    >
      <EditorLayerSettings />
    </div>
  );
};
