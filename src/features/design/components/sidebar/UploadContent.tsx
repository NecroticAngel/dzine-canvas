import XIcon from '@duyank/icons/regular/X';
import { useEditor } from '@lidojs/design-editor';
import { fetchSvgContent } from '@lidojs/design-utils';
import axios from 'axios';
import { type ChangeEvent, type FC, useRef, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useAsync } from 'react-use';

interface UploadItem {
  id?: string;
  name?: string;
  url: string;
  type: 'svg' | 'image';
}

interface UploadContentProps {
  visibility: boolean;
  onClose: () => void;
}

export const UploadContent: FC<UploadContentProps> = ({
  visibility,
  onClose,
}) => {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const { actions } = useEditor();

  const [images, setImages] = useState<UploadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useAsync(async () => {
    if (!visibility) return;
    setIsLoading(true);
    try {
      const response = await axios.get<UploadItem[]>('/uploads');
      const list = Array.isArray(response.data) ? response.data : [];
      setImages(list);
      setLoadError(null);
    } catch {
      setImages([]);
      setLoadError(
        'Could not reach the uploads API. Run `npm run api` (or `npm run dev:all`).',
      );
    } finally {
      setIsLoading(false);
    }
  }, [visibility]);

  const addImage = async (url: string) => {
    if (!window) return;
    const img = new Image();
    img.onerror = (err) => window.alert(err);
    img.src = url;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      actions.addImageLayer(
        { url, thumb: url },
        { width: img.naturalWidth, height: img.naturalHeight },
      );
      if (isMobile) {
        onClose();
      }
    };
  };
  const addSvg = async (url: string) => {
    const ele = await fetchSvgContent(url);
    const viewBox = ele.getAttribute('viewBox')?.split(' ') || [];
    const width =
      viewBox.length === 4 ? +viewBox[2] : +(ele.getAttribute('width') || 100);
    const height =
      viewBox.length === 4 ? +viewBox[3] : +(ele.getAttribute('height') || 100);
    actions.addSvgLayer(url, { width, height }, ele);
    if (isMobile) {
      onClose();
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    setLoadError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await axios.post<UploadItem>('/uploads', body, {
        timeout: 60_000,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImages((prev) => [response.data, ...prev]);
    } catch {
      // Fallback: keep working offline with a data URL if API is down
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages((prev) =>
          prev.concat([
            {
              url: reader.result as string,
              type: file.type === 'image/svg+xml' ? 'svg' : 'image',
            },
          ]),
        );
        setLoadError(
          'Upload API unreachable — file kept in this session only.',
        );
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      css={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        overflowY: 'auto',
        display: visibility ? 'flex' : 'none',
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
          Upload Images
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
          margin: 16,
          background: '#3a3a4c',
          borderRadius: 8,
          color: '#fff',
          padding: '8px 16px',
          cursor: isUploading ? 'wait' : 'pointer',
          textAlign: 'center',
          opacity: isUploading ? 0.7 : 1,
        }}
        onClick={() => !isUploading && inputFileRef.current?.click()}
      >
        {isUploading ? 'Uploading…' : 'Upload'}
      </div>
      <input
        ref={inputFileRef}
        accept="image/*"
        css={{ display: 'none' }}
        type="file"
        onChange={handleUpload}
      />
      {(isLoading || loadError) && (
        <p
          css={{
            margin: '0 16px 8px',
            fontSize: 12,
            color: 'var(--app-text-muted, #888)',
          }}
        >
          {isLoading ? 'Loading uploads…' : loadError}
        </p>
      )}
      <div css={{ padding: '16px' }}>
        <div
          css={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
            gridGap: 8,
          }}
        >
          {images.map((item, idx) => (
            <div
              key={item.id || item.url || idx}
              css={{ cursor: 'pointer', position: 'relative' }}
              onClick={() =>
                item.type === 'image' ? addImage(item.url) : addSvg(item.url)
              }
            >
              <div css={{ paddingBottom: '100%', height: 0 }} />
              <div
                css={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  alt={item.name || item.url}
                  css={{ maxHeight: '100%' }}
                  loading="lazy"
                  src={item.url}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
