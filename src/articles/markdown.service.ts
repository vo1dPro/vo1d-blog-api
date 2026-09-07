import { Injectable } from '@nestjs/common';
import { Marked, Renderer, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface RenderedMarkdown {
  contentHtml: string;
  toc: TocItem[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugifyHeading(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

class SafeMarkdownRenderer extends Renderer {
  readonly toc: TocItem[] = [];
  private readonly usedIds = new Map<string, number>();

  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(text);
  }

  override heading({ tokens, depth }: Tokens.Heading): string {
    const inlineHtml = this.parser.parseInline(tokens);
    const plainText = sanitizeHtml(inlineHtml, { allowedTags: [], allowedAttributes: {} }).trim();
    const base = slugifyHeading(plainText);
    const seen = this.usedIds.get(base) ?? 0;
    this.usedIds.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;
    this.toc.push({ id, text: plainText, level: depth });
    return `<h${depth} id="${escapeHtml(id)}">${inlineHtml}</h${depth}>\n`;
  }
}

@Injectable()
export class MarkdownService {
  render(markdown: string): RenderedMarkdown {
    const renderer = new SafeMarkdownRenderer();
    const parser = new Marked();
    parser.setOptions({ renderer, gfm: true, breaks: false });
    const rendered = parser.parse(markdown, { async: false });
    if (typeof rendered !== 'string') {
      throw new Error('Synchronous Markdown rendering returned a promise');
    }
    const contentHtml = sanitizeHtml(rendered, {
      allowedTags: [
        'p',
        'br',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'li',
        'blockquote',
        'a',
        'img',
        'code',
        'pre',
        'strong',
        'em',
        'del',
        'hr',
      ],
      allowedAttributes: {
        a: ['href', 'title', 'rel'],
        img: ['src', 'alt', 'title'],
        code: ['class'],
        h1: ['id'],
        h2: ['id'],
        h3: ['id'],
        h4: ['id'],
        h5: ['id'],
        h6: ['id'],
      },
      allowedClasses: { code: [/^language-[a-z0-9_-]+$/i] },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: { img: ['http', 'https'] },
      allowProtocolRelative: false,
      transformTags: {
        a: (_tagName, attributes) => ({
          tagName: 'a',
          attribs: { ...attributes, rel: 'noopener noreferrer' },
        }),
      },
    });
    return { contentHtml, toc: renderer.toc };
  }
}
