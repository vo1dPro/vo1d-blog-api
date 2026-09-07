import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  contentToMarkdown,
  dateAtUtc,
  LEGACY_GAME_FILENAMES,
  parseFrontendLiteral,
  safePublicPath,
  skillIconKey,
  tagSlug,
} from '../../scripts/frontend-source.js';

describe('frontend source importer', () => {
  it('reads escaped strings and undefined directly from typed literals without executing module code', () => {
    const source = `throw new Error('must not execute'); export const games: Game[] = [{ id: 1, title: '\\u4e09\\u4f0f', platform: undefined, rating: 0 }]`;
    expect(parseFrontendLiteral(source, 'games')).toEqual([
      { id: 1, title: '三伏', platform: undefined, rating: 0 },
    ]);
  });
  it('rejects calls, spread values and prototype mutations rather than evaluating them', () => {
    expect(() => parseFrontendLiteral('const games = dangerousFunction()', 'games')).toThrow(
      'No code was executed',
    );
    expect(() => parseFrontendLiteral('const games = [{ ...unknown }]', 'games')).toThrow(
      'literal object properties',
    );
    expect(() => parseFrontendLiteral('const games = { __proto__: {} }', 'games')).toThrow(
      'Unsafe',
    );
  });
  it('converts code tags and HTML entities into inline Markdown without losing paragraphs', () => {
    expect(
      contentToMarkdown(['Use <code>&lt;script setup&gt;</code>.', 'Use <code>`tick`</code>.']),
    ).toBe('Use `<script setup>`.\n\nUse `` `tick` ``.');
  });
  it('keeps dates in UTC and refuses normalized impossible calendar dates', () => {
    expect(dateAtUtc('2026-07-23')?.toISOString()).toBe('2026-07-23T00:00:00.000Z');
    expect(dateAtUtc(undefined)).toBeNull();
    expect(() => dateAtUtc('2026-02-30')).toThrow('Invalid calendar date');
  });
  it('maps all six special Windows game filenames explicitly', () => {
    expect(Object.keys(LEGACY_GAME_FILENAMES)).toHaveLength(6);
    expect(LEGACY_GAME_FILENAMES['NieRAutomata™.jpg']).toBe('NieRAutomata#U2122.jpg');
    expect(LEGACY_GAME_FILENAMES['界外狂潮.jpg']).toBe('#U754c#U5916#U72c2#U6f6e.jpg');
    expect(LEGACY_GAME_FILENAMES['Wallpaper Engine：壁纸引擎.jpg']).toBe(
      'Wallpaper Engine#Uff1a#U58c1#U7eb8#U5f15#U64ce.jpg',
    );
  });
  it('refuses paths outside the frontend public directory', () => {
    expect(safePublicPath(resolve('frontend'), '/images/books/a.png')).toBe(
      resolve('frontend/public/images/books/a.png'),
    );
    expect(() => safePublicPath(resolve('frontend'), '/images/../../secret')).toThrow('escapes');
    expect(() => safePublicPath(resolve('frontend'), 'https://example.com/a.png')).toThrow(
      '/images/',
    );
    expect(() => safePublicPath(resolve('frontend'), '/images/..\\secret')).toThrow('/images/');
  });
  it('derives stable icon keys without uploading frontend SVG files', () => {
    expect(skillIconKey('/images/icons/react-light.svg')).toBe('react');
    expect(skillIconKey('/images/icons/ant-design-dark-theme.svg')).toBe('ant-design');
    expect(skillIconKey('/images/icons/postgresql.svg')).toBe('postgresql');
    expect(tagSlug('Node.js')).toBe('node-js');
    expect(tagSlug('Build Tools')).toBe('build-tools');
  });
});
