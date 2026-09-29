import type { LayerId, SerializedLayers } from '@lidojs/design-core';

export type QrCodeItem = {
  elements: [
    {
      rootId: LayerId;
      layers: SerializedLayers;
    },
  ];
  /**
   * How the panel should draw this preset's thumbnail.
   *
   * It used to be a path to a shipped PNG, which meant the thumbnail could
   * claim the preset looked like something it did not - the three that shipped
   * showed a logo and branding that the panel strips out on insert. Drawing it
   * from a descriptor keeps the thumbnail honest by construction, and the panel
   * renders the code itself through exactly the same path as the layer.
   */
  thumb: {
    caption?: string;
    /** Draw a card behind the code. */
    card?: 'light' | 'dark';
  };
};

export const qrCodeList: QrCodeItem[] = [
  {
    elements: [
      {
        rootId: '3f39efa2-4017-4c77-b3a9-c98456c629f0',
        layers: {
          '3f39efa2-4017-4c77-b3a9-c98456c629f0': {
            type: { resolvedName: 'QrCodeLayer' },
            props: {
              text: 'https://d-zine.example',
              position: { x: 45.586770981507925, y: 121.96449211646916 },
              boxSize: {
                width: 350.8264580369844,
                height: 350.8264580369844,
              },
              rotate: 0,
              bgColor: 'rgb(255, 255, 255)',
              textColor: 'rgb(30, 30, 45)',
              logo: '',
              scale: 3.508264580369843,
            },
            locked: false,
            child: [],
            parent: 'ROOT',
          },
        },
      },
    ],
    // A bare code: no card, no caption.
    thumb: {},
  },
  {
    elements: [
      {
        rootId: '5c11f494-5d02-4d65-a816-c9669c519065',
        layers: {
          '5c11f494-5d02-4d65-a816-c9669c519065': {
            type: { resolvedName: 'GroupLayer' },
            props: {
              position: { x: 23.478260869565247, y: 100.89354861209551 },
              boxSize: { width: 395.04347826086956, height: 462 },
              scale: 1,
              rotate: 0,
            },
            locked: false,
            child: [
              'd78fb0c2-7a1c-4381-8571-c9871ccd9cac',
              '3f39efa2-4017-4c77-b3a9-c98456c629f0',
              '930dca01-95e0-4527-be58-ede3cc41bc2e',
            ],
            parent: 'ROOT',
          },
          'd78fb0c2-7a1c-4381-8571-c9871ccd9cac': {
            type: { resolvedName: 'SvgLayer' },
            props: {
              image:
                'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnN2Zz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1OSIgaGVpZ2h0PSI2OSIgdmlld0JveD0iMCwtMC4wMDAwMDc2MjkzOTQ1MzEyNSwxNS40Nzk1NTMyMjI2NTYyNSwxOC4xNDQzNDA1MTUxMzY3MiIgdmVyc2lvbj0iMS4xIiB4bWw6c3BhY2U9InByZXNlcnZlIj4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtNDcuNDQxODM1LC0xMTUuODQ5NjcpIj4KICAgIDxyZWN0IHdpZHRoPSIxNS40Nzk1NTEiIGhlaWdodD0iMTguMTQ0MzM5IiB4PSI0Ny40NDE4MzMiIHk9Ii0xMzMuOTk0IiB0cmFuc2Zvcm09InNjYWxlKDEsLTEpIiByeT0iMC40NTEwMTUxNyIvPgogICAgPHJlY3QgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIwLjUyNTg1OyIgaWQ9ImNyYXlvbi11bmlxdWUtaWQtMzQtNCIgd2lkdGg9IjE0LjU5MTQzNyIgaGVpZ2h0PSIxNC41NTI4MjQiIHg9IjQ3LjkwMzUiIHk9Ii0xMzAuODUzMDkiIHRyYW5zZm9ybT0ic2NhbGUoMSwtMSkiIHJ5PSIwLjMxNjk5OTkxIi8+CiAgPC9nPgo8L3N2Zz4K',
              position: { x: 0, y: 0 },
              boxSize: { width: 395.04347826086956, height: 462 },
              colors: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'],
              rotate: 0,
            },
            locked: false,
            child: [],
            parent: '5c11f494-5d02-4d65-a816-c9669c519065',
          },
          '3f39efa2-4017-4c77-b3a9-c98456c629f0': {
            type: { resolvedName: 'QrCodeLayer' },
            props: {
              text: 'https://d-zine.example',
              position: { x: 22.108510111942678, y: 21.070943504373645 },
              boxSize: {
                width: 350.8264580369844,
                height: 350.8264580369844,
                x: 1082.586770981508,
                y: 155.9961470707375,
              },
              rotate: 0,
              bgColor: 'rgb(255, 255, 255)',
              textColor: 'rgb(30, 30, 45)',
              logo: '',
              scale: 3.508264580369843,
            },
            locked: false,
            child: [],
            parent: '5c11f494-5d02-4d65-a816-c9669c519065',
          },
          '930dca01-95e0-4527-be58-ede3cc41bc2e': {
            type: { resolvedName: 'TextLayer' },
            props: {
              doc: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    attrs: {
                      textAlign: 'center',
                      color: 'rgb(255, 255, 255)',
                      fontFamily: 'Roboto',
                      fontSize: '38px',
                      lineHeight: '1.4',
                      letterSpacing: 0,
                      textTransform: null,
                      marginLeft: null,
                      indent: 0,
                      listType: '',
                    },
                    content: [
                      {
                        type: 'text',
                        marks: [
                          { type: 'bold' },
                          {
                            type: 'color',
                            attrs: { color: 'rgb(255, 255, 255)' },
                          },
                        ],
                        text: 'SCAN ME',
                      },
                    ],
                  },
                ],
              },
              position: { x: 30.717362039152988, y: 393.1064513879045 },
              boxSize: {
                width: 333.60875418256376,
                height: 64,
                x: 1300.8495002212821,
                y: 524.5,
              },
              scale: 1.2075471698113207,
              rotate: 0,
              colors: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'],
              fontSizes: [38],
            },
            locked: false,
            child: [],
            parent: '5c11f494-5d02-4d65-a816-c9669c519065',
          },
        },
      },
    ],
    // Code in a light card with a caption underneath.
    thumb: { caption: 'SCAN ME', card: 'light' },
  },
  {
    elements: [
      {
        rootId: '54751aa8-e4cd-46d9-9baa-231efde747ac',
        layers: {
          '54751aa8-e4cd-46d9-9baa-231efde747ac': {
            type: { resolvedName: 'GroupLayer' },
            props: {
              position: { x: 1207.2199999999998, y: 147.90937608922968 },
              boxSize: { width: 329.5600000000002, height: 462 },
              scale: 1,
              rotate: 0,
            },
            locked: false,
            child: [
              'fc9cdd05-0d4a-4eaa-a2ad-1ab579a68be1',
              '9fa1b8a2-7771-4d17-b319-d551e4001836',
              'd9d46596-6424-4787-a583-f0f9a9f475d8',
            ],
            parent: 'ROOT',
          },
          'fc9cdd05-0d4a-4eaa-a2ad-1ab579a68be1': {
            type: { resolvedName: 'SvgLayer' },
            props: {
              image:
                'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGlkPSJjcmF5b24tdW5pcXVlLWlkLTI1LTAiIHZpZXdCb3g9IjAsMCwzODMuMTYwMDAzNjYyMTA5NCw1MzUuNTEwMDA5NzY1NjI1IiB3aWR0aD0iMTA3IiBoZWlnaHQ9IjE1MCIgZGF0YS1lZGl0YWJsZT0idHJ1ZSIgc3R5bGU9ImRpc3BsYXk6IGJsb2NrOyI+PGRlZnM+PC9kZWZzPjxnIGlkPSJjcmF5b24tdW5pcXVlLWlkLTI1LTEiPjxyZWN0IHdpZHRoPSIzODMuMTYiIGhlaWdodD0iNTM1LjUxIiByeD0iMjEuNjUiIHJ5PSIyMS42NSI+PC9yZWN0PjxwYXRoIGQ9Im0xMzQuNTgsNDIxLjA5bDU1LjktMjQuMjhjLjcyLS4zMSwxLjQ3LS4zMSwyLjIsMGw1NS45LDI0LjI4Yy42Ny4yOS41NSwyLjAxLS4xNCwyLjAxaC0xMTMuNzJjLS42OSwwLS44LTEuNzItLjE0LTIuMDFaIiBmaWxsPSIjZmZmZmZmIj48L3BhdGg+PHJlY3QgeD0iMTUuNDEiIHk9IjE1LjciIHdpZHRoPSIzNTIuNTciIGhlaWdodD0iMzUyLjU3IiByeD0iMTYuNDciIHJ5PSIxNi40NyIgZmlsbD0iI2ZmZmZmZiI+PC9yZWN0PjwvZz48L3N2Zz4=',
              position: { x: 2.2737367544323206e-13, y: 0 },
              boxSize: { width: 329.56, height: 462 },
              colors: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'],
              rotate: 0,
            },
            locked: false,
            child: [],
            parent: '54751aa8-e4cd-46d9-9baa-231efde747ac',
          },
          '9fa1b8a2-7771-4d17-b319-d551e4001836': {
            type: { resolvedName: 'QrCodeLayer' },
            props: {
              text: 'https://d-zine.example',
              position: { x: 24.866770981508125, y: 25.24833839665183 },
              boxSize: {
                width: 279.8264580369843,
                height: 279.8264580369843,
                x: 1009.6934326710815,
                y: 215.1577144858814,
              },
              rotate: 0,
              bgColor: 'rgb(255, 255, 255)',
              textColor: 'rgb(30, 30, 45)',
              logo: '',
              scale: 2.7982645803698425,
            },
            locked: false,
            child: [],
            parent: '54751aa8-e4cd-46d9-9baa-231efde747ac',
          },
          'd9d46596-6424-4787-a583-f0f9a9f475d8': {
            type: { resolvedName: 'TextLayer' },
            props: {
              doc: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    attrs: {
                      textAlign: 'center',
                      color: 'rgb(255, 255, 255)',
                      fontFamily: 'Roboto',
                      fontSize: '38px',
                      lineHeight: '1.4',
                      letterSpacing: 0,
                      textTransform: null,
                      marginLeft: null,
                      indent: 0,
                      listType: '',
                    },
                    content: [
                      {
                        type: 'text',
                        marks: [
                          { type: 'bold' },
                          {
                            type: 'color',
                            attrs: { color: 'rgb(255, 255, 255)' },
                          },
                        ],
                        text: 'SCAN ME',
                      },
                    ],
                  },
                ],
              },
              position: { x: 0, y: 382.98417252286583 },
              boxSize: {
                width: 325.60875418256376,
                height: 64,
                x: 1016.2199999999999,
                y: 530.8935486120955,
              },
              scale: 1.2075471698113207,
              rotate: 0,
              colors: ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'],
              fontSizes: [38],
            },
            locked: false,
            child: [],
            parent: '54751aa8-e4cd-46d9-9baa-231efde747ac',
          },
        },
      },
    ],
    // Code on a dark card, which is the one that reads as a poster.
    thumb: { caption: 'SCAN ME', card: 'dark' },
  },
];
