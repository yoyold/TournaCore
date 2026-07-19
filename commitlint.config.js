/** Conventional Commits, keeping history machine-readable for changelogs. */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'setup',
        'domain',
        'models',
        'store',
        'services',
        'ui',
        'bracket',
        'tournament',
        'team',
        'match',
        'stats',
        'transfer',
        'i18n',
        'theme',
        'a11y',
        'legal',
        'ci',
        'docs',
        'deps',
      ],
    ],
  },
};
