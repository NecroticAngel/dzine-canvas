import XIcon from '@duyank/icons/regular/X';
import type {
  LayerId,
  LayerType,
  SerializedLayerTree,
  SerializedLayers,
} from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import { type FC, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { qrCodeList } from '../../config/qrCode';

/**
 * A neutral demo icon for new QR codes.
 *
 * An inline SVG rather than a bundled asset, and drawn in the code's own dark
 * colour so it stays legible whatever palette a preset uses — a fixed black
 * would vanish on a dark QR. The QR toolbar can replace or clear it.
 */
const cogIcon = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
      color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
      '</svg>',
  )}`;

export const QrCodeContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { actions } = useEditor();
  const [url, setUrl] = useState('');
  /**
   * Insert a QR preset.
   *
   * The shipped presets bake their own logo into the layer, so it is replaced
   * here with a neutral cog as a demo icon — a new QR should not carry the
   * shipped branding, but showing an icon makes the feature discoverable. The
   * QR toolbar can swap it for the user's own image or clear it. Passing
   * `payload` overrides the preset's destination.
   */
  const addQrCode = async (elements: SerializedLayerTree, payload?: string) => {
    const tree = JSON.parse(JSON.stringify(elements)) as SerializedLayerTree;
    for (const id of Object.keys(tree.layers)) {
      const layer = tree.layers[id] as {
        type: { resolvedName: string };
        props: Record<string, unknown>;
      };
      if (layer?.type?.resolvedName === 'QrCodeLayer') {
        const { logo: _shipped, textColor, ...rest } = layer.props;
        layer.props = {
          ...rest,
          logo: cogIcon(String(textColor ?? '#1e1e2d')),
          ...(payload === undefined ? {} : { text: payload }),
        };
      }
    }
    actions.addLayerTree(tree);
    if (isMobile) {
      onClose();
    }
  };

  const addCustomQrCode = () => {
    const payload = url.trim();
    if (!payload) return;
    void addQrCode(qrCodeList[0].elements[0], payload);
  };
  const handleDrag = (
    event: React.DragEvent,
    elements: SerializedLayerTree,
  ) => {
    const data: {
      layer: LayerType;
      data: { rootId: LayerId; layers: SerializedLayers };
    } = {
      layer: 'Image',
      data: elements,
    };
    const { clientX, clientY } = event;
    actions.startDragNDrop(data, { x: clientX, y: clientY });
    event.dataTransfer.clearData('text/plain');
    event.dataTransfer.setData('text/plain', JSON.stringify(data));
    event.dataTransfer.setDragImage(new Image(), 0, 0);
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
          QR Code
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
        {/* Your own destination, rather than only the shipped presets. */}
        <div css={{ display: 'flex', gap: 8, padding: '12px 16px 0', flexShrink: 0 }}>
          <input
            value={url}
            aria-label="QR destination"
            placeholder="https://example.com"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addCustomQrCode();
            }}
            css={{
              flex: 1,
              minWidth: 0,
              border: '1px solid var(--app-border-strong)',
              background: 'var(--app-surface)',
              color: 'var(--app-text-strong)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 13,
              outline: 'none',
              ':focus': { borderColor: '#3d8eff' },
            }}
          />
          <button
            type="button"
            onClick={addCustomQrCode}
            disabled={!url.trim()}
            css={{
              border: 'none',
              background: '#3d8eff',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              ':disabled': { opacity: 0.5, cursor: 'not-allowed' },
            }}
          >
            Add
          </button>
        </div>
        <div
          css={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
            gridGap: 8,
            padding: '16px',
          }}
        >
          {qrCodeList.map((item, index) => (
            <div
              key={index}
              css={{
                cursor: 'pointer',
                position: 'relative',
                '-webkit-user-drag': 'element',
              }}
              onClick={() => addQrCode(item.elements[0])}
              onDragStart={(e) => handleDrag(e, item.elements[0])}
            >
              <div css={{ paddingBottom: '100%' }} />
              <div
                css={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  alt={item.img}
                  css={{
                    maxHeight: '100%',
                    maxWidth: '100%',
                  }}
                  src={item.img}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
