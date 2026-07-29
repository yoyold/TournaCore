import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@utils/cn';

export interface FlagIconProps {
  /** ISO 3166-1 alpha-2, case-insensitive. */
  countryCode?: string | undefined;
  /** Rendered width in pixels. Height follows the 3:2 aspect ratio. */
  width?: number;
  /**
   * Glossy sheen in the style of the classic tournament-wiki flag icons.
   * On by default; pass false for a flat flag.
   */
  glossy?: boolean;
  className?: string | undefined;
}

const CODE_PATTERN = /^[A-Za-z]{2}$/;

/**
 * Glossy highlight laid over the flag.
 *
 * The look tournament wikis use: a bright top half, a hard specular line just
 * below the middle, then a dim reflection below. It is a single gradient rather
 * than an image, so it costs nothing and scales with the flag.
 */
const GLOSS =
  'linear-gradient(to bottom,' +
  ' rgba(255,255,255,0.55) 0%,' +
  ' rgba(255,255,255,0.18) 47%,' +
  ' rgba(255,255,255,0.05) 48%,' +
  ' rgba(255,255,255,0.00) 60%,' +
  ' rgba(0,0,0,0.10) 100%)';

/**
 * Country flag, served from our own origin.
 *
 * Three constraints shaped this, and they rule out the obvious approaches:
 *
 * A flag CDN is out of the question — it would transmit every visitor's IP
 * address to a third party and break the guarantee that nothing leaves the
 * user's device.
 *
 * Emoji flags are out too, however tempting their zero cost. Windows ships no
 * flag glyphs, so Chrome and Edge there render a pair of letter boxes instead of
 * a flag. A feature that looks broken on the most common desktop platform is not
 * a feature.
 *
 * What remains is bundled SVGs referenced by `<img>`. They stay out of the
 * JavaScript bundle and the browser fetches each one only when a flag actually
 * appears, so a bracket with four nations costs four small files rather than the
 * whole set. The glossy sheen on top is a pure CSS overlay, so it adds no assets.
 */
export function FlagIcon({ countryCode, width = 16, glossy = true, className }: FlagIconProps) {
  const { i18n } = useTranslation();
  const [failed, setFailed] = useState(false);

  const code = countryCode?.trim().toUpperCase();
  if (code === undefined || !CODE_PATTERN.test(code) || failed) return null;

  const height = Math.round((width * 2) / 3);

  /*
   * Decorative: the team name next to it already identifies the entry, and
   * announcing a country for every side of every match would bury that name in
   * noise. The title still surfaces it on hover for sighted users.
   */
  const image = (
    <img
      src={`${import.meta.env.BASE_URL}flags/${code}.svg`}
      alt=""
      aria-hidden
      title={countryName(code, i18n.language)}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => {
        // An unknown or retired code has no file. Render nothing rather than a
        // broken image placeholder.
        setFailed(true);
      }}
      className="block h-full w-full object-cover"
    />
  );

  if (!glossy) {
    return (
      <span
        className={cn('inline-block shrink-0 overflow-hidden rounded-[2px]', className)}
        style={{ width, height }}
      >
        {image}
      </span>
    );
  }

  return (
    <span
      className={cn(
        // The ring keeps a white-heavy flag (Japan, Poland) from dissolving into
        // a light card, and the shadow lifts it off the surface for the gloss to
        // read as a sheen rather than a smear.
        'relative inline-block shrink-0 overflow-hidden rounded-[2px]',
        'ring-1 ring-black/20 shadow-[0_1px_1px_rgba(0,0,0,0.25)]',
        className,
      )}
      style={{ width, height }}
    >
      {image}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[2px]"
        style={{ background: GLOSS }}
      />
    </span>
  );
}

/**
 * Localised country name, falling back to the raw code.
 *
 * `Intl.DisplayNames` is part of the platform, so this costs nothing in bundle
 * size and follows the user's chosen language without a translation table.
 */
function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
