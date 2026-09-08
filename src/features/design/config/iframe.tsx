import type { LayerId, SerializedLayers } from '@lidojs/design-core';

export type IframeItem = {
  elements: [
    {
      rootId: LayerId;
      layers: SerializedLayers;
    },
  ];
  img: string;
};

export const iframeList: IframeItem[] = [
  {
    elements: [
      {
        rootId: '3f39efa2-4017-4c77-b3a9-c98456c629f0',
        layers: {
          '3f39efa2-4017-4c77-b3a9-c98456c629f0': {
            type: { resolvedName: 'IframeLayer' },
            props: {
              url: 'https://api.wo-cloud.com/content/widget/?geoObjectKey=6112695&language=en&region=US&timeFormat=HH:mm&windUnit=mph&systemOfMeasurement=imperial&temperatureUnit=fahrenheit',
              position: { x: 45.586770981507925, y: 121.96449211646916 },
              boxSize: {
                width: 350.8264580369844,
                height: 350.8264580369844,
              },
              rotate: 0,
              scale: 1,
            },
            locked: false,
            child: [],
            parent: 'ROOT',
          },
        },
      },
    ],
    img: 'assets/images/weather/1.png',
  },
];
