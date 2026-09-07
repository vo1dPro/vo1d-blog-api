import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { z } from 'zod';

const positiveId = z.number().int().positive();
const text = z.string().min(1);
const sourceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const articleSchema = z.object({
  id: positiveId,
  title: text,
  category: text,
  date: sourceDate,
  tags: z.array(text),
  summary: text,
  content: z.array(text).min(1),
});
const categorySchema = z.object({ key: text, label: text, icon: text });
const bookSchema = z.object({
  id: positiveId,
  title: text,
  author: text,
  cover: text,
  accent: text,
  sourceName: z.string(),
  sourceUrl: z.string(),
  readingOrder: positiveId,
  readingTime: sourceDate,
  startedAt: sourceDate.optional(),
  finishedAt: sourceDate.optional(),
  progress: z.number().int().min(0).max(100),
});
const gameSchema = z.object({
  id: positiveId,
  title: text,
  platform: text.optional(),
  cover: text,
  rating: z.number().min(0).max(10),
  playtimeHours: z.number().int().nonnegative(),
  likeLevel: z.number().int().min(0).max(5),
  comment: z.string(),
});
const photoSchema = z.object({
  id: positiveId,
  src: text,
  thumbnailSrc: text,
  alt: text,
  title: text,
  description: text,
});
const skillSchema = z.object({ name: text, image: text, darkImage: text.optional() });
const socialSchema = z.object({ name: text, url: z.url(), icon: text });

export interface FrontendData {
  articles: z.infer<typeof articleSchema>[];
  categories: z.infer<typeof categorySchema>[];
  books: z.infer<typeof bookSchema>[];
  games: z.infer<typeof gameSchema>[];
  photos: z.infer<typeof photoSchema>[];
  skills: z.infer<typeof skillSchema>[];
  socials: z.infer<typeof socialSchema>[];
  thumbnails: string[];
  profile: {
    displayName: string;
    role: string;
    heroTitlePrefix: string;
    heroDescription: string;
    learningNote: string;
    footerMessage: string;
  };
}

/** Deliberately interprets data literals only. Imported frontend code is never executed. */
function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node) && node.text === 'undefined') return undefined;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return literalValue(node.expression);
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const value = literalValue(node.operand);
    if (typeof value === 'number') return -value;
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literalValue);
  if (ts.isObjectLiteralExpression(node)) {
    const value: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
      ) {
        throw new Error('Only named literal object properties are allowed in frontend data');
      }
      const name = property.name.text;
      if (['__proto__', 'constructor', 'prototype'].includes(name)) {
        throw new Error(`Unsafe frontend data property: ${name}`);
      }
      if (Object.hasOwn(value, name)) throw new Error(`Duplicate frontend data property: ${name}`);
      value[name] = literalValue(property.initializer);
    }
    return value;
  }
  throw new Error(
    `Unsupported frontend data expression: ${ts.SyntaxKind[node.kind]}. No code was executed.`,
  );
}

export function parseFrontendLiteral(
  source: string,
  variable: string,
  filename = 'source.ts',
): unknown {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === variable &&
        declaration.initializer
      ) {
        return literalValue(declaration.initializer);
      }
    }
  }
  throw new Error(`Cannot find data literal ${variable} in ${filename}`);
}

function jsxText(node: ts.Node): string {
  if (ts.isJsxText(node)) return node.text.replace(/\s+/g, ' ');
  if (ts.isJsxExpression(node) && node.expression) {
    const value = literalValue(node.expression);
    if (typeof value !== 'string') throw new Error('Profile content must be static text');
    return value;
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) return node.children.map(jsxText).join('');
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'br') return ' ';
  return '';
}

function findJsx(file: ts.Node, tag: string, classFragment?: string): ts.JsxElement {
  let found: ts.JsxElement | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === tag) {
      const classAttribute = node.openingElement.attributes.properties.find(
        (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'className',
      );
      if (
        classFragment === undefined ||
        (classAttribute &&
          ts.isJsxAttribute(classAttribute) &&
          classAttribute.initializer &&
          ts.isStringLiteral(classAttribute.initializer) &&
          classAttribute.initializer.text.includes(classFragment))
      ) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!found) throw new Error(`Cannot find static profile element ${tag} ${classFragment ?? ''}`);
  return found;
}

async function profileFromSource(sourceRoot: string): Promise<FrontendData['profile']> {
  // New clients keep migration literals separately after switching components to public reads.
  const snapshotPath = resolve(sourceRoot, 'src/data/site-profile.ts');
  const snapshotExists = await stat(snapshotPath)
    .then(() => true)
    .catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
      throw error;
    });
  if (snapshotExists) {
    return z
      .object({
        displayName: text,
        role: text,
        heroTitlePrefix: text,
        heroDescription: text,
        learningNote: text,
        footerMessage: text,
      })
      .parse(
        parseFrontendLiteral(await readFile(snapshotPath, 'utf8'), 'siteProfile', snapshotPath),
      );
  }
  const readComponent = async (name: string): Promise<ts.SourceFile> => {
    const path = resolve(sourceRoot, `src/components/${name}/index.tsx`);
    return ts.createSourceFile(
      path,
      await readFile(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  };
  const [hero, footer, sidebar, skillsText] = await Promise.all([
    readComponent('HeroSection'),
    readComponent('AppFooter'),
    readComponent('BlogPostSidebar'),
    readFile(resolve(sourceRoot, 'src/components/SkillsSection/index.tsx'), 'utf8'),
  ]);
  const title = findJsx(hero, 'h1');
  const name = findJsx(title, 'span');
  const displayName = jsxText(name).trim();
  const titleText = jsxText(title).replace(/\s+/g, ' ').trim();
  if (!titleText.endsWith(displayName))
    throw new Error('Cannot separate hero title prefix from display name');
  return {
    displayName,
    role: jsxText(findJsx(sidebar, 'p', 'text-xs')).trim(),
    heroTitlePrefix: titleText.slice(0, -displayName.length).trim(),
    heroDescription: jsxText(findJsx(hero, 'p')).replace(/\s+/g, ' ').trim(),
    learningNote: text.parse(parseFrontendLiteral(skillsText, 'learningNote', 'SkillsSection.tsx')),
    footerMessage: jsxText(findJsx(footer, 'p', 'animated-footer__intro')).trim(),
  };
}

export async function readFrontendData(sourceRoot: string): Promise<FrontendData> {
  const read = async (file: string, name: string): Promise<unknown> =>
    parseFrontendLiteral(await readFile(resolve(sourceRoot, file), 'utf8'), name, file);
  const [articles, categories, books, games, photos, skills, socials, thumbnails, profile] =
    await Promise.all([
      read('src/data/articles.ts', 'articles'),
      read('src/data/articles.ts', 'categories'),
      read('src/data/books.ts', 'books'),
      read('src/data/games.ts', 'games'),
      read('src/data/photos.ts', 'photos'),
      read('src/data/skills.ts', 'skillIconPlaceholders'),
      read('src/data/socials.ts', 'socials'),
      read('src/lib/blog.ts', 'thumbnails'),
      profileFromSource(sourceRoot),
    ]);
  const data: FrontendData = {
    articles: z.array(articleSchema).length(6).parse(articles),
    categories: z.array(categorySchema).length(6).parse(categories),
    books: z.array(bookSchema).length(3).parse(books),
    games: z.array(gameSchema).length(47).parse(games),
    photos: z.array(photoSchema).length(10).parse(photos),
    skills: z.array(skillSchema).length(24).parse(skills),
    socials: z.array(socialSchema).length(3).parse(socials),
    thumbnails: z.array(text).length(6).parse(thumbnails),
    profile,
  };
  for (const [name, rows] of Object.entries({
    articles: data.articles,
    books: data.books,
    games: data.games,
    photos: data.photos,
  })) {
    const sorted = rows.map((row) => row.id).sort((a, b) => a - b);
    if (sorted.some((id, index) => id !== index + 1))
      throw new Error(`${name}: expected unique original IDs 1..${rows.length}`);
  }
  const keys = new Set(data.categories.map((category) => category.key));
  if (keys.size !== data.categories.length) throw new Error('Duplicate category keys');
  for (const article of data.articles) {
    if (!keys.has(article.category))
      throw new Error(`Article ${article.id} has unknown category ${article.category}`);
    dateAtUtc(article.date);
  }
  return data;
}

/** The six actual filename corrections are explicit and inspectable. */
export const LEGACY_GAME_FILENAMES: Readonly<Record<string, string>> = {
  'NieRAutomata™.jpg': 'NieRAutomata#U2122.jpg',
  'Titanfall® 2.jpg': 'Titanfall#U00ae 2.jpg',
  'Wallpaper Engine：壁纸引擎.jpg': 'Wallpaper Engine#Uff1a#U58c1#U7eb8#U5f15#U64ce.jpg',
  '界外狂潮.jpg': '#U754c#U5916#U72c2#U6f6e.jpg',
  '三伏.jpg': '#U4e09#U4f0f.jpg',
  '烟火.jpg': '#U70df#U706b.jpg',
};

export interface SourceMedia {
  reference: string;
  sourcePath: string;
  path: string;
  kind: 'IMAGE' | 'PHOTO_ORIGINAL' | 'PHOTO_THUMBNAIL';
  altText: string;
}

export function safePublicPath(sourceRoot: string, sourcePath: string): string {
  if (
    !sourcePath.startsWith('/images/') ||
    sourcePath.includes('\\') ||
    sourcePath.includes('\0')
  ) {
    throw new Error(`Only frontend /images/ paths can be imported: ${sourcePath}`);
  }
  const publicRoot = resolve(sourceRoot, 'public');
  const resolved = resolve(publicRoot, `.${sourcePath}`);
  const child = relative(publicRoot, resolved);
  if (child.startsWith(`..${sep}`) || child === '..' || isAbsolute(child)) {
    throw new Error(`Frontend media escapes public directory: ${sourcePath}`);
  }
  return resolved;
}

export async function preflightFrontendMedia(
  sourceRoot: string,
  data: FrontendData,
): Promise<SourceMedia[]> {
  const requests: Omit<SourceMedia, 'path'>[] = [];
  for (const article of data.articles) {
    const sourcePath = data.thumbnails[article.id - 1];
    if (!sourcePath) throw new Error(`Missing cover for article ${article.id}`);
    requests.push({
      reference: `article:${article.id}`,
      sourcePath,
      kind: 'IMAGE',
      altText: article.title,
    });
  }
  for (const book of data.books)
    requests.push({
      reference: `book:${book.id}`,
      sourcePath: book.cover,
      kind: 'IMAGE',
      altText: book.title,
    });
  for (const game of data.games)
    requests.push({
      reference: `game:${game.id}`,
      sourcePath: game.cover,
      kind: 'IMAGE',
      altText: game.title,
    });
  for (const photo of data.photos) {
    requests.push({
      reference: `photo-original:${photo.id}`,
      sourcePath: photo.src,
      kind: 'PHOTO_ORIGINAL',
      altText: photo.alt,
    });
    requests.push({
      reference: `photo-thumbnail:${photo.id}`,
      sourcePath: photo.thumbnailSrc,
      kind: 'PHOTO_THUMBNAIL',
      altText: photo.alt,
    });
  }
  const publicRoot = await realpath(resolve(sourceRoot, 'public'));
  const results = await Promise.allSettled(
    requests.map(async (request): Promise<SourceMedia> => {
      const mappedName = request.sourcePath.startsWith('/images/games/')
        ? LEGACY_GAME_FILENAMES[basename(request.sourcePath)]
        : undefined;
      const candidates = [
        request.sourcePath,
        ...(mappedName ? [`/images/games/${mappedName}`] : []),
      ];
      for (const candidate of candidates) {
        const path = safePublicPath(sourceRoot, candidate);
        try {
          if (!(await stat(path)).isFile()) continue;
          const real = await realpath(path);
          const child = relative(publicRoot, real);
          if (child.startsWith(`..${sep}`) || child === '..' || isAbsolute(child))
            throw new Error('Symlink escapes public directory');
          return { ...request, path: real };
        } catch (error: unknown) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
          throw error;
        }
      }
      throw new Error(`${request.reference}: ${candidates.join(' OR ')}`);
    }),
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected'
      ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
      : [],
  );
  if (errors.length)
    throw new Error(
      `Media preflight failed. No database or storage writes were made:\n${errors.join('\n')}`,
    );
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (match: string, entity: string) => {
      if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? match;
      const code = entity.toLowerCase().startsWith('#x')
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    },
  );
}

export function contentToMarkdown(paragraphs: readonly string[]): string {
  return paragraphs
    .map((paragraph) =>
      paragraph
        .replace(/<code>([\s\S]*?)<\/code>/gi, (_match: string, code: string) => {
          const value = decodeEntities(code);
          const runs = value.match(/`+/g) ?? [];
          const delimiter = '`'.repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
          const padded = value.startsWith('`') || value.endsWith('`') ? ` ${value} ` : value;
          return `${delimiter}${padded}${delimiter}`;
        })
        .trim(),
    )
    .join('\n\n');
}

export function dateAtUtc(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value)
    throw new Error(`Invalid calendar date: ${value}`);
  return result;
}

export function skillIconKey(image: string): string {
  return basename(image, '.svg').replace(/-(?:light|dark)(?:-theme)?$/, '');
}

export function tagSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug || !/[a-z]/.test(slug)) throw new Error(`Tag needs an explicit stable slug: ${name}`);
  return slug;
}
