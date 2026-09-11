import FrameCornersIcon from '@duyank/icons/regular/FrameCorners';
import ImageIcon from '@duyank/icons/regular/Image';
import LayoutIcon from '@duyank/icons/regular/Layout';
import PencilIcon from '@duyank/icons/regular/Pencil';
import PiggyBankIcon from '@duyank/icons/regular/PiggyBank';
import QrCodeIcon from '@duyank/icons/regular/QrCode';
import SquareIcon from '@duyank/icons/regular/Square';
import TableIcon from '@duyank/icons/regular/Table';
import TextTIcon from '@duyank/icons/regular/TextT';
import UploadIcon from '@duyank/icons/regular/Upload';
// import VideoIcon from '@duyank/icons/regular/Video';
import { useEditor } from '@lidojs/design-editor';
import { useCallback, useState } from 'react';
import { SidebarTab } from '../tabs';
import { DrawContent } from './DrawContent';
import { FrameContent } from './FrameContent';
import { GraphicContent } from './GraphicContent';
import { ImageContent } from './ImageContent';
import { QrCodeContent } from './QrCodeContent';
import { ShapeContent } from './ShapeContent';
import { TableContent } from './TableContent';
import { TemplateContent } from './TemplateContent';
import { TextContent } from './TextContent';
import { UploadContent } from './UploadContent';
// import { VideoContent } from './VideoContent';

const tabs = [
  {
    name: 'Template',
    icon: <LayoutIcon />,
  },
  {
    name: 'Text',
    icon: <TextTIcon />,
  },
  {
    name: 'Shape',
    icon: <SquareIcon />,
  },
  {
    name: 'Table',
    icon: <TableIcon />,
    isBusiness: true,
  },
  {
    name: 'Frame',
    icon: <FrameCornersIcon />,
  },
  {
    name: 'Image',
    icon: <ImageIcon />,
  },
  {
    name: 'Graphic',
    icon: <PiggyBankIcon />,
  },
  {
    name: 'QrCode',
    icon: <QrCodeIcon />,
    isBusiness: true,
  },
  {
    name: 'Draw',
    icon: <PencilIcon />,
    isBusiness: true,
  },
  // {
  //   name: 'Video',
  //   icon: <VideoIcon />,
  // },
  {
    name: 'Upload',
    icon: <UploadIcon />,
  },
];
export const Sidebar = () => {
  const { actions } = useEditor();
  const [tab, setTab] = useState<string | null>('Template');

  const handleCloseTab = useCallback(() => {
    setTab(null);
    actions.setSidebar();
  }, [actions]);
  return (
    <div
      css={{
        display: 'flex',
        zIndex: 2,
        position: 'relative',
        backgroundColor: 'var(--app-sidebar)',
        borderRight: '1px solid var(--app-border-strong)',
      }}
    >
      <div
        css={{
          display: 'flex',
        }}
      >
        <SidebarTab
          active={tab}
          tabs={tabs}
          onChange={(_, tab) => {
            actions.setSidebar();
            setTab(tab);
          }}
        />
        {tab && (
          <div
            css={{
              width: tab === 'Draw' ? 0 : 360,
              background: 'var(--app-panel)',
              color: 'var(--app-text)',
              '@media (max-width: 900px)': {
                width: '100%',
                position: 'fixed',
                bottom: 0,
                left: 0,
                top: 0,
                background: 'var(--app-panel)',
              },
            }}
          >
            {tab === 'Template' && (
              <TemplateContent
                onClose={() => {
                  setTab(null);
                  actions.setSidebar();
                }}
              />
            )}
            {tab === 'Text' && <TextContent onClose={handleCloseTab} />}
            {tab === 'Frame' && <FrameContent onClose={handleCloseTab} />}
            {tab === 'Image' && <ImageContent onClose={handleCloseTab} />}
            {tab === 'Graphic' && <GraphicContent onClose={handleCloseTab} />}
            {tab === 'QrCode' && <QrCodeContent onClose={handleCloseTab} />}
            {tab === 'Shape' && <ShapeContent onClose={handleCloseTab} />}
            {tab === 'Table' && <TableContent onClose={handleCloseTab} />}
            {/* {tab === 'Video' && <VideoContent onClose={handleCloseTab} />} */}
            {tab === 'Draw' && <DrawContent onClose={handleCloseTab} />}
            <UploadContent
              visibility={tab === 'Upload'}
              onClose={handleCloseTab}
            />
          </div>
        )}
      </div>
      <div
        css={{
          width: 360,
          position: 'absolute',
          overflow: 'hidden',
          top: 0,
          left: 73,
          height: '100%',
          pointerEvents: 'none',
        }}
        id="settings"
      />
    </div>
  );
};
