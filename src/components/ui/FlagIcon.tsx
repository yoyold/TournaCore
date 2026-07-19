import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@utils/cn';

export interface FlagIconProps {
  /** ISO 3166-1 alpha-2, case-insensitive. */
  countryCode?: string | undefined;
  /** Rendered width in pixels. Height follows the 3:2 aspect ratio. */
  width?: number;
  className?: string | undefined;
}

const CODE_PATTERN = /^[A-Za-z]{2}$/;

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
 * whole set.
 */
export function FlagIcon({ countryCode, width = 16, className }: FlagIconProps) {
  const { i18n } = useTranslation();
  const [failed, setFailed] = useState(false);

  const code = countryCode?.trim().toUpperCase();
  if (code === undefined || !CODE_PATTERN.test(code) || failed) return null;

  /*
   * Decorative: the team name next to it already identifies the entry, and
   * announcing a country for every side of every match would bury that name in
   * noise. The title still surfaces it on hover for sighted users.
   */
  return (
    <img
      src={`${import.meta.env.BASE_URL}flags/${code}.svg`}
      alt=""
      aria-hidden
      title={countryName(code, i18n.language)}
      width={width}
      height={Math.round((width * 2) / 3)}
      loading="lazy"
      decoding="async"
      onError={() => {
        // An unknown or retired code has no file. Render nothing rather than a
        // broken image placeholder.
        setFailed(true);
      }}
      className={cn('shrink-0 rounded-[1px] object-cover', className)}
      style={{ width, height: Math.round((width * 2) / 3) }}
    />
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
