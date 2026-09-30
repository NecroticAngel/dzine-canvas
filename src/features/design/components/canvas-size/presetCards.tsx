import AtIcon from '@duyank/icons/regular/At';
import BriefcaseIcon from '@duyank/icons/regular/Briefcase';
import CameraIcon from '@duyank/icons/regular/Camera';
import CubeIcon from '@duyank/icons/regular/Cube';
import MusicNotesIcon from '@duyank/icons/regular/MusicNotes';
import PinterestLogoIcon from '@duyank/icons/regular/PinterestLogo';
import PlayIcon from '@duyank/icons/regular/Play';
import PrinterIcon from '@duyank/icons/regular/Printer';
import RulerIcon from '@duyank/icons/regular/Ruler';
import SquaresFourIcon from '@duyank/icons/regular/SquaresFour';
import StorefrontIcon from '@duyank/icons/regular/Storefront';
import UsersIcon from '@duyank/icons/regular/Users';
import type { CanvasPreset } from '../../config/canvasPresets';

/**
 * The pieces of the canvas-size picker that are shared between starting a
 * design and resizing one.
 *
 * Only the presentational parts live here — a preset's proportional outline, and
 * the card around it. The two dialogs differ in what they do with the choice
 * (create versus re-lay-out) and in their surrounding chrome, but a preset has to
 * look the same in both, and a second copy of this would drift.
 */

/** Matches the app's primary action colour, used elsewhere as `#3d8eff`. */
export const ACCENT = '#3d8eff';

export type IconComponent = (props: {
  width?: number;
  height?: number;
}) => JSX.Element;

export const ICONS: Record<string, IconComponent> = {
  grid: SquaresFourIcon,
  users: UsersIcon,
  camera: CameraIcon,
  at: AtIcon,
  briefcase: BriefcaseIcon,
  play: PlayIcon,
  music: MusicNotesIcon,
  pin: PinterestLogoIcon,
  store: StorefrontIcon,
  printer: PrinterIcon,
  box: CubeIcon,
  ruler: RulerIcon,
};

/** A small proportional outline of a preset's aspect ratio. */
export const PresetPreview = ({
  width,
  height,
  max = 30,
}: {
  width: number;
  height: number;
  max?: number;
}) => {
  const ratio = width / height;
  const w = Math.max(6, ratio >= 1 ? max : max * ratio);
  const h = Math.max(6, ratio >= 1 ? max / ratio : max);
  return (
    <div
      css={{
        width: w,
        height: h,
        border: '1px solid var(--app-border-strong)',
        borderRadius: 2,
        background: 'var(--app-panel)',
        boxShadow: 'var(--app-canvas-shadow)',
      }}
    />
  );
};

export const PresetCard = ({
  preset,
  onPick,
}: {
  preset: CanvasPreset;
  onPick: () => void;
}) => (
  <button
    type="button"
    onClick={onPick}
    css={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 10,
      textAlign: 'left',
      border: '1px solid var(--app-border)',
      background: 'var(--app-panel)',
      color: 'var(--app-text-strong)',
      borderRadius: 10,
      cursor: 'pointer',
      transition: 'border-color .15s ease, box-shadow .15s ease',
      ':hover': {
        borderColor: ACCENT,
        boxShadow: '0 4px 14px rgba(0,0,0,.12)',
      },
    }}
  >
    <div
      css={{
        width: '100%',
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        background: 'var(--app-surface)',
      }}
    >
      <PresetPreview width={preset.width} height={preset.height} />
    </div>
    <div css={{ minWidth: 0, width: '100%' }}>
      <span
        css={{
          display: 'block',
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--app-text-strong)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {preset.label}
      </span>
      <span
        css={{
          display: 'block',
          fontSize: 11,
          color: 'var(--app-text-muted)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {preset.width} × {preset.height}
      </span>
    </div>
  </button>
);
