import XBoldIcon from '@duyank/icons/bold/XBold';
import { useEditor } from '@lidojs/design-editor';
import { useDraw } from '@lidojs/draw';
import { type FC, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Highlighter } from '../../../../shared/icons/pencil/Highlighter';
import { Marker } from '../../../../shared/icons/pencil/Marker';
import { Pencil } from '../../../../shared/icons/pencil/Pencil';

export const DrawContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const penColorRef = useRef('#0571d3');
  const penWidthRef = useRef(5);
  const scaleRef = useRef(1);
  const transparencyRef = useRef(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { actions, scale, activePage, sidebar } = useEditor((state) => ({
    scale: state.scale,
    activePage: state.activePage,
    sidebar: state.sidebar,
  }));
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useDraw({
    options: {
      width: penWidthRef.current * scaleRef.current,
      minWidth: 33 * scaleRef.current,
      minHeight: 33 * scaleRef.current,
    },
    canStartDraw: (e) => {
      const page = document.getElementById(`lidojs-page-${activePage}`);
      if (!page) {
        throw new Error("Can't find page");
      }
      const rect = page.getBoundingClientRect();
      if (
        e.x >= rect.x &&
        e.x <= rect.x + rect.width &&
        e.y >= rect.y &&
        e.y <= rect.y + rect.height &&
        !sidebar &&
        boxRef.current
      ) {
        boxRef.current.style.pointerEvents = 'auto';
        boxRef.current.style.opacity = transparencyRef.current.toString();
        return true;
      }
      return false;
    },
    onChange: (path) => {
      if (!svgRef.current) return;
      const svgPath = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      svgPath.setAttributeNS(null, 'd', path);
      svgPath.setAttributeNS(null, 'fill', 'none');
      svgPath.setAttributeNS(null, 'stroke', penColorRef.current);
      svgPath.setAttributeNS(null, 'stroke-linecap', 'round');
      svgPath.setAttributeNS(
        null,
        'stroke-width',
        (penWidthRef.current * scaleRef.current).toString(),
      );
      svgRef.current.appendChild(svgPath);
    },
    onEnd: (path, boxSize, position) => {
      const page = document.getElementById(`lidojs-page-${activePage}`);
      if (page) {
        const rect = page.getBoundingClientRect();
        const p = {
          x: (position.x - rect.x) / scaleRef.current,
          y: (position.y - rect.y) / scaleRef.current,
        };
        actions.addDrawLayer(
          { path, color: penColorRef.current, width: penWidthRef.current },
          {
            width: boxSize.width / scaleRef.current,
            height: boxSize.height / scaleRef.current,
          },
          p,
          1 / scaleRef.current,
          transparencyRef.current,
        );
      }

      if (boxRef.current) {
        boxRef.current.style.pointerEvents = 'none';
      }
      if (svgRef.current) {
        svgRef.current.innerHTML = '';
      }
    },
  });

  useEffect(() => {
    if (!window) return;
    const { innerWidth: width, innerHeight: height } = window;
    setSize({ width, height });
  }, []);

  return (
    <>
      <div
        css={{
          position: 'absolute',
          left: 72,
          top: 44,
          zIndex: 10,
          overflow: 'hidden',
          width: 120,
          height: 250,
          paddingTop: 60,
          paddingBottom: 60,
        }}
      >
        <div
          css={{
            background: '#FFFFFF',
            boxShadow:
              '0px 0px 0px 1px rgba(64,87,109,.04),0px 6px 20px -4px rgba(64,87,109,.3)',
            width: 30,
            height: 30,
            borderRadius: 9999,
            zIndex: 10,
            top: 0,
            left: 30,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={() => onClose()}
        >
          <XBoldIcon />
        </div>
        <div
          css={{
            background: '#ffffff',
            borderRadius: 20,
            inset: 0,
            top: 40,
            right: 40,
            bottom: 10,
            position: 'absolute',
            boxShadow:
              '0px 0px 0px 1px rgba(64,87,109,.04),0px 6px 20px -4px rgba(64,87,109,.3)',
          }}
        />
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            position: 'relative',
          }}
        >
          <div
            css={{
              color: 'rgb(5, 113, 211)',
              marginLeft: '-30px',
              cursor: 'pointer',
              ':hover': {
                marginLeft: 0,
              },
            }}
            onClick={() => {
              penColorRef.current = '#0571d3';
              penWidthRef.current = 5;
              transparencyRef.current = 1;
            }}
          >
            <Pencil width="100px" />
          </div>
          <div
            css={{
              color: 'rgb(231, 25, 31)',
              marginLeft: '-30px',
              cursor: 'pointer',
              ':hover': {
                marginLeft: 0,
              },
            }}
            onClick={() => {
              penColorRef.current = '#e7171f';
              penWidthRef.current = 10;
              transparencyRef.current = 1;
            }}
          >
            <Marker width="100px" />
          </div>
          <div
            css={{
              color: 'rgb(255, 242, 52)',
              marginLeft: '-30px',
              cursor: 'pointer',
              ':hover': {
                marginLeft: 0,
              },
            }}
            onClick={() => {
              penColorRef.current = '#fff234';
              penWidthRef.current = 20;
              transparencyRef.current = 0.8;
            }}
          >
            <Highlighter width="100px" />
          </div>
        </div>
      </div>
      {createPortal(
        <div
          ref={boxRef}
          css={{ position: 'absolute', inset: 0 }}
          style={{ pointerEvents: 'none' }}
        >
          <svg
            ref={svgRef}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            width={size.width}
            xmlns="http://www.w3.org/2000/svg"
          />
        </div>,
        document.body,
      )}
    </>
  );
};
