import MagnifyingGlassIcon from '@duyank/icons/regular/MagnifyingGlass';
import XIcon from '@duyank/icons/regular/X';
import {
  type LayerId,
  type LayerType,
  type SerializedLayers,
  useEventCallback,
} from '@lidojs/design-core';
import { useEditor } from '@lidojs/design-editor';
import axios from 'axios';
import type React from 'react';
import { type FC, type FormEvent, useEffect, useRef, useState } from 'react';
import { isMobile } from 'react-device-detect';
import Masonry from 'react-responsive-masonry';
import { useAsync } from 'react-use';
import { Photo } from './Photo';

export const ImageContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const qRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(false);
  const [images, setImages] = useState<
    {
      id: string;
      image: string;
      thumb: string;
      width: number;
      height: number;
      username: string;
      name: string;
    }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const { actions, query } = useEditor((state) => ({
    dragNDrop: state.dragNDrop,
  }));

  const loadImageList = useEventCallback(async (offset = 0) => {
    dataRef.current = true;
    setIsLoading(true);
    const params = {
      limit: '40',
      page: `${(images.length % 40) + 1}`,
      q: keyword,
    };
    const response = await axios.get<
      {
        id: string;
        image: string;
        thumb: string;
        width: number;
        height: number;
        username: string;
        name: string;
      }[]
    >(`/images?${new URLSearchParams(params).toString()}`);
    if (offset) {
      setImages((prevState) => {
        prevState.push(...response.data);
        return prevState;
      });
    } else {
      setImages(response.data);
    }
    setIsLoading(false);
    if (response.data.length > 0) {
      dataRef.current = false;
    }
  });
  useAsync(async () => {
    await loadImageList(0);
  }, [loadImageList]);

  useEffect(() => {
    const handleLoadMore = async (e: Event) => {
      const node = e.target as HTMLDivElement;
      if (
        node.scrollHeight - node.scrollTop - 80 <= node.clientHeight &&
        !dataRef.current
      ) {
        await loadImageList(images.length);
      }
    };
    const ele = scrollRef.current;
    ele?.addEventListener('scroll', handleLoadMore);
    return () => {
      ele?.removeEventListener('scroll', handleLoadMore);
    };
  }, [loadImageList, images]);
  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setKeyword(qRef.current?.value || '');
    setTimeout(async () => {
      await loadImageList(0);
    });
  };
  const addImage = async (item: {
    id: string;
    image: string;
    thumb: string;
    width: number;
    height: number;
    username: string;
    name: string;
  }) => {
    actions.addImageLayer(
      { thumb: item.thumb, url: item.image },
      { width: item.width, height: item.height },
    );
    axios.put(`/images?id=${item.id}`);
    if (isMobile) {
      onClose();
    }
  };

  const handleDrag = (
    event: React.DragEvent,
    item: {
      id: string;
      image: string;
      thumb: string;
      width: number;
      height: number;
      username: string;
      name: string;
    },
  ) => {
    const { clientX, clientY } = event;
    const pageSize = query.getPageSize(query.activePage());
    const ratio = pageSize.width / pageSize.height;
    const imgRatio = item.width / item.height;
    const w =
      ratio < imgRatio
        ? pageSize.width * 0.8
        : pageSize.height * imgRatio * 0.8;
    const h = w / imgRatio;
    const data: {
      layer: LayerType;
      data: { rootId: LayerId; layers: SerializedLayers };
    } = {
      layer: 'Image',
      data: {
        rootId: item.id,
        layers: {
          [item.id]: {
            type: {
              resolvedName: 'ImageLayer',
            },
            props: {
              image: {
                url: item.image,
                thumb: item.thumb,
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
        css={{
          flexDirection: 'column',
          overflowY: 'auto',
          display: 'flex',
          flexGrow: 1,
        }}
      >
        <div
          css={{
            borderRadius: 4,
            boxShadow: '0 0 0 1px rgba(43,59,74,.3)',
            margin: 16,
          }}
        >
          <div
            css={{
              height: 40,
              borderRadius: 4,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div css={{ fontSize: 24, marginRight: 8, flexShrink: 0 }}>
              <MagnifyingGlassIcon />
            </div>
            <form onSubmit={handleSearch}>
              <input
                ref={qRef}
                css={{ width: '100%', height: '100%' }}
                type="text"
              />
            </form>
          </div>
        </div>
        <div
          ref={scrollRef}
          css={{
            flexGrow: 1,
            overflowY: 'auto',
            padding: '16px',
            gridGap: 8,
          }}
        >
          <Masonry columnsCount={2} gutter="8px">
            {images.map((item) => (
              <Photo
                key={item.id}
                image={item.thumb}
                name={item.name}
                username={item.username}
                onClick={() => {
                  addImage(item);
                }}
                onDragStart={(e) => handleDrag(e, item)}
              />
            ))}
          </Masonry>
          {isLoading && <div>Loading...</div>}
        </div>
      </div>

      <div css={{ flexShrink: 0, paddingLeft: 16, textAlign: 'center' }}>
        Photos by
        <a href="https://unsplash.com/" rel="noreferrer" target="_blank">
          Unsplash
        </a>
      </div>
    </div>
  );
};
