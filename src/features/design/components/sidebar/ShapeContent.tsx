import XIcon from '@duyank/icons/regular/X';
import type { LayerId, LayerType, SerializedLayers } from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import type { FC } from 'react';
import { isMobile } from 'react-device-detect';
import { v4 } from 'uuid';
import { type Line, lines } from '../../config/line';
import { type Shape, shapes } from '../../config/shape';

export const ShapeContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { actions, query } = useEditor();
  const addLine = (props: Line['props']) => {
    actions.addLineLayer({ props });
  };
  const addShape = (shape: Shape) => {
    actions.addShapeLayer({
      type: {
        resolvedName: 'ShapeLayer',
      },
      props: {
        shape: shape.type,
        position: {
          x: 0,
          y: 400,
        },
        boxSize: {
          width: shape.width,
          height: shape.height,
        },
        rotate: 0,
        color: '#5E6278',
      },
    });
    if (isMobile) {
      onClose();
    }
  };

  const handleDrag = (event: React.DragEvent, shape: Shape) => {
    const { clientX, clientY } = event;
    const id = v4();
    const data: {
      layer: LayerType;
      data: { rootId: LayerId; layers: SerializedLayers };
    } = {
      layer: 'Shape',
      data: {
        rootId: id,
        layers: {
          [id]: {
            type: {
              resolvedName: 'ShapeLayer',
            },
            locked: false,
            parent: 'ROOT',
            child: [],
            props: {
              shape: shape.type,
              position: {
                x: 0,
                y: 400,
              },
              boxSize: {
                width: shape.width,
                height: shape.height,
              },
              rotate: 0,
              color: '#5E6278',
            },
          },
        },
      },
    };
    actions.startDragNDrop(data, { x: clientX, y: clientY });
    event.dataTransfer.clearData('text/plain');
    event.dataTransfer.setData('text/plain', JSON.stringify(data));
    event.dataTransfer.setDragImage(new Image(), 0, 0);
  };
  const handleDragLine = (event: React.DragEvent, line: Line) => {
    const { clientX, clientY } = event;
    const width = query.getPageSize(query.activePage()).width / 2;
    const data: {
      layer: LayerType;
      data: { rootId: LayerId; layers: SerializedLayers };
    } = {
      layer: 'Line',
      data: {
        rootId: line.id,
        layers: {
          [line.id]: {
            props: {
              ...line.props,
              boxSize: {
                width,
                height: 4,
              },
              position: {
                x: 0,
                y: 0,
              },
              style: 'solid',
              color: 'rgb(0, 0, 0)',
              scale: 1,
              rotate: 0,
            },
            type: {
              resolvedName: 'LineLayer',
            },
            locked: false,
            parent: 'ROOT',
            child: [],
          },
        },
      },
    };
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
          Shapes
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
      <div css={{ padding: '16px' }}>
        <div css={{ padding: '8px 0', fontWeight: 700 }}>
          Arrow
          <div
            css={{
              display: 'inline-block',
              marginLeft: 6,
              background: '#fdebcf',
              borderRadius: 9999,
              fontSize: 9,
              padding: '2px 4px',
            }}
          >
            Business
          </div>
        </div>
        <div
          css={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
            gridGap: 8,
          }}
        >
          {lines.map((l, idx) => (
            <div
              key={idx}
              draggable
              css={{
                width: '100%',
                paddingBottom: '100%',
                position: 'relative',
                cursor: 'pointer',
                '-webkit-user-drag': 'element',
              }}
              onClick={() => addLine(l.props)}
              onDragStart={(e) => handleDragLine(e, l)}
            >
              <div
                css={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {l.icon}
              </div>
            </div>
          ))}
        </div>
        <div css={{ padding: '8px 0', fontWeight: 700 }}>Shape</div>
        <div
          css={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
            gridGap: 8,
          }}
        >
          {shapes.map((shape) => (
            <div
              key={shape.type}
              css={{
                width: '100%',
                paddingBottom: '100%',
                position: 'relative',
                cursor: 'pointer',
                '-webkit-user-drag': 'element',
              }}
              draggable={true}
              onClick={() => addShape(shape)}
              onDragStart={(e) => handleDrag(e, shape)}
            >
              {shape.icon}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
