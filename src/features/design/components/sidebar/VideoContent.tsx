import XIcon from '@duyank/icons/regular/X';
import type { LayerId, LayerType, SerializedLayers } from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import { type FC, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useAsync } from 'react-use';
import { v4 } from 'uuid';

export const VideoContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [videos] = useState<
    { img: string; url: string; width: number; height: number }[]
  >([
    {
      img: 'https://template.canva.com/EAFaarkqz_0/2/0/400w-IVVQCZOr1K4.jpg',
      url: 'https://template.canva.com/EAFaarkqz_0/2/0/400w-xadNArxL6gA.mp4',
      width: 400,
      height: 334,
    },
  ]);
  const [isLoading] = useState(false);
  const { actions, query } = useEditor();
  useAsync(async () => {
    //const response = await axios.get<{ img: string; url: string; width: number; height: number }[]>('/videos');
    //setVideos(response.data);
    //setIsLoading(false);
  }, []);

  const addVideo = ({
    url,
    width,
    height,
  }: {
    url: string;
    width: number;
    height: number;
  }) => {
    actions.addVideoLayer({ url }, { width, height });
    if (isMobile) {
      onClose();
    }
  };

  const handleDrag = (
    event: React.DragEvent,
    { url, width, height }: (typeof videos)[number],
  ) => {
    const { clientX, clientY } = event;
    const pageSize = query.getPageSize(query.activePage());
    const ratio = pageSize.width / pageSize.height;
    const imgRatio = width / height;
    const w =
      ratio < imgRatio
        ? pageSize.width * 0.4
        : pageSize.height * imgRatio * 0.4;
    const h = w / imgRatio;
    const id: LayerId = v4();
    const data: {
      layer: LayerType;
      data: { rootId: LayerId; layers: SerializedLayers };
    } = {
      layer: 'Video',
      data: {
        rootId: id,
        layers: {
          [id]: {
            type: {
              resolvedName: 'VideoLayer',
            },
            props: {
              video: {
                url: url,
                boxSize: {
                  width: w,
                  height: h,
                },
                position: {
                  x: 0,
                  y: 0,
                },
                rotate: 0,
              },
              position: {
                x: 0,
                y: 0,
              },
              boxSize: {
                width: w,
                height: h,
              },
              rotate: 0,
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
          Images
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
            padding: '16px',
            gridGap: 8,
          }}
        >
          {isLoading && <div>Loading...</div>}
          {videos.map((item, idx) => (
            <div
              key={idx}
              css={{
                cursor: 'pointer',
                position: 'relative',
                paddingBottom: '100%',
                width: '100%',
                '-webkit-user-drag': 'element',
              }}
              onClick={() => addVideo(item)}
              draggable={true}
              onDragStart={(e) => handleDrag(e, item)}
            >
              <img
                alt={item.img}
                css={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: '100%',
                  objectFit: 'cover',
                }}
                loading="lazy"
                src={item.img}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
