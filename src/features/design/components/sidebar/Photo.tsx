import { type FC, type HTMLProps, memo, useState } from 'react';

type Props = {
  image: string;
  name: string;
  username: string;
} & HTMLProps<HTMLDivElement>;

export const Photo: FC<Props> = memo(({ image, name, username, ...props }) => {
  const [isShow, setIsShow] = useState(false);
  return (
    <div
      css={{
        cursor: 'pointer',
        position: 'relative',
        '-webkit-user-drag': 'element',
      }}
      {...props}
      onMouseOut={() => setIsShow(false)}
      onMouseOver={() => setIsShow(true)}
    >
      <img alt={image} loading="lazy" src={image} />
      <p
        css={{
          display: isShow ? 'block' : 'none',
          position: 'absolute',
          bottom: 0,
          fontSize: 10,
          left: 0,
          right: 0,
          color: '#fff',
          textAlign: 'center',
          paddingTop: 12,
          paddingBottom: 2,
          paddingLeft: 4,
          paddingRight: 4,
          background:
            'linear-gradient(0deg, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.2) 80%, rgba(0, 0, 0, 0) 100%)',
        }}
      >
        Photo by
        <a
          css={{ color: '#3d8eff' }}
          href={`https://unsplash.com/@${username}?utm_source=dzine-canvas&utm_medium=referral`}
          rel="noreferrer"
          target="_blank"
        >
          {name}
        </a>
        on
        <a
          href={`https://unsplash.com/@${username}?utm_source=dzine-canvas&utm_medium=referral`}
          rel="noreferrer"
          target="_blank"
        >
          unsplash
        </a>
      </p>
    </div>
  );
});
