import XIcon from '@duyank/icons/regular/X';
import type { LayerId, SerializedLayers } from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import axios from 'axios';
import { type FC, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useAsync } from 'react-use';
import {
  addABodyText,
  addAHeading,
  addASubheading,
} from '../../../../constant/text-effects';
import { getThumbnail } from '../../../../utils/thumbnail';

interface Text {
  img: string;
  elements: {
    rootId: LayerId;
    layers: SerializedLayers;
  };
}

export const TextContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { actions } = useEditor();
  const [texts, setTexts] = useState<Text[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useAsync(async () => {
    const response = await axios.get<Text[]>('/texts');
    setTexts(response.data);
    setIsLoading(false);
  }, []);

  const handleAddText = (data: {
    rootId: LayerId;
    layers: SerializedLayers;
  }) => {
    actions.addTextLayer(data);
    if (isMobile) {
      onClose();
    }
  };

  const handleDrag = (
    event: React.DragEvent,
    data: { rootId: LayerId; layers: SerializedLayers },
  ) => {
    const { clientX, clientY } = event;
    actions.startDragNDrop({ layer: 'Text', data }, { x: clientX, y: clientY });
    event.dataTransfer.clearData('text/plain');
    event.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ layer: 'Text', data }),
    );
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
          Text
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
            padding: 16,
            display: 'flex',
            gap: 8,
            flexDirection: 'column',
          }}
        >
          <div
            css={{
              fontSize: 28,
              lineHeight: 1,
              padding: '16px 16px',
              fontWeight: 700,
              background: 'var(--app-surface)',
              borderRadius: 4,
              cursor: 'pointer',
              '-webkit-user-drag': 'element',
            }}
            draggable={true}
            onClick={() => handleAddText(addAHeading)}
            onDragStart={(e) => handleDrag(e, addAHeading)}
          >
            Add a heading
          </div>
          <div
            css={{
              fontSize: 18,
              lineHeight: 1,
              padding: '16px',
              fontWeight: 700,
              background: 'var(--app-surface)',
              borderRadius: 4,
              cursor: 'pointer',
              '-webkit-user-drag': 'element',
            }}
            onClick={() => handleAddText(addASubheading)}
            onDragStart={(e) => handleDrag(e, addASubheading)}
          >
            Add a subheading
          </div>
          <div
            css={{
              fontSize: 12,
              lineHeight: 1,
              padding: '16px',
              fontWeight: 700,
              background: 'var(--app-surface)',
              borderRadius: 4,
              cursor: 'pointer',
              '-webkit-user-drag': 'element',
            }}
            onClick={() => handleAddText(addABodyText)}
            onDragStart={(e) => handleDrag(e, addABodyText)}
          >
            Add a little bit of body text
          </div>
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
          {isLoading && <div>Loading...</div>}
          {texts.map(({ img, elements }, idx) => (
            <div
              key={idx}
              css={{
                cursor: 'pointer',
                position: 'relative',
                paddingBottom: '100%',
                width: '100%',
                '-webkit-user-drag': 'element',
              }}
              onClick={() => handleAddText(elements)}
              onDragStart={(e) => handleDrag(e, elements)}
            >
              <img
                alt={getThumbnail(img)}
                css={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: '100%',
                  objectFit: 'cover',
                }}
                src={getThumbnail(img)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
