import XIcon from '@duyank/icons/regular/X';
import type {
  LayerId,
  LayerType,
  SerializedLayerTree,
  SerializedLayers,
} from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import type { FC } from 'react';
import { isMobile } from 'react-device-detect';
import { qrCodeList } from '../../config/qrCode';

export const QrCodeContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { actions } = useEditor();
  const addQrCode = async (elements: SerializedLayerTree) => {
    actions.addLayerTree(elements);
    if (isMobile) {
      onClose();
    }
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
