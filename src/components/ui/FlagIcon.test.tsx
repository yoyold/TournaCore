import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FlagIcon } from './FlagIcon';

/** The flag is decorative, so it is queried by role rather than by name. */
const flag = () => document.querySelector('img');

describe('FlagIcon', () => {
  it('renders a flag from the application origin', () => {
    render(<FlagIcon countryCode="DE" />);

    const img = flag();
    expect(img).not.toBeNull();
    // Relative to BASE_URL, never a third-party host: an external request would
    // leak the visitor's IP address.
    expect(img?.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}flags/DE.svg`);
  });

  it('accepts a lower-case code', () => {
    render(<FlagIcon countryCode="fr" />);
    expect(flag()?.getAttribute('src')).toContain('/flags/FR.svg');
  });

  it('renders nothing without a country', () => {
    render(<FlagIcon />);
    expect(flag()).toBeNull();
  });

  it('renders nothing for a malformed code', () => {
    for (const code of ['', 'D', 'DEU', '12', 'de-DE']) {
      const { unmount } = render(<FlagIcon countryCode={code} />);
      expect(flag(), `code ${JSON.stringify(code)}`).toBeNull();
      unmount();
    }
  });

  it('is hidden from assistive technology', () => {
    // The team name beside it already identifies the entry; announcing a country
    // for every side of every match would bury it.
    render(<FlagIcon countryCode="SE" />);

    expect(flag()).toHaveAttribute('aria-hidden', 'true');
    expect(flag()).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('names the country for sighted users on hover', () => {
    render(<FlagIcon countryCode="JP" />);
    expect(flag()?.getAttribute('title')).toBeTruthy();
  });

  it('keeps the 3:2 aspect ratio', () => {
    render(<FlagIcon countryCode="BR" width={24} />);

    expect(flag()).toHaveAttribute('width', '24');
    expect(flag()).toHaveAttribute('height', '16');
  });

  it('loads lazily so a large bracket does not fetch every flag at once', () => {
    render(<FlagIcon countryCode="US" />);
    expect(flag()).toHaveAttribute('loading', 'lazy');
  });
});
