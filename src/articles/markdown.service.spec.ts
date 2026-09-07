import { describe, expect, it } from 'vitest';
import { MarkdownService } from './markdown.service.js';

describe('MarkdownService', () => {
  const service = new MarkdownService();

  it('renders the supported prose, code, images and safe links', () => {
    const source = [
      '# Heading',
      '**Bold** and *emphasis* with `inline()`.',
      '- First\n- Second',
      '> Quoted text',
      '[Example](https://example.com "Example")',
      '![Cover](https://example.com/cover.webp)',
      '```typescript\nconst count = 1;\n```',
    ].join('\n\n');
    const result = service.render(source);
    expect(result.contentHtml).toContain('<h1 id="heading">Heading</h1>');
    expect(result.contentHtml).toContain('<strong>Bold</strong>');
    expect(result.contentHtml).toContain('<code>inline()</code>');
    expect(result.contentHtml).toContain('<ul>');
    expect(result.contentHtml).toContain('<blockquote>');
    expect(result.contentHtml).toContain('rel="noopener noreferrer"');
    expect(result.contentHtml).toContain('src="https://example.com/cover.webp"');
    expect(result.contentHtml).toContain('<code class="language-typescript">');
    expect(result.toc).toEqual([{ id: 'heading', text: 'Heading', level: 1 }]);
  });

  it.each([
    '<script>alert(document.cookie)</script>',
    '<img src=x onerror="alert(1)">',
    '<iframe src="https://attacker.example"></iframe>',
    '<svg onload="alert(1)"></svg>',
    '<a href="javascript:alert(1)">Click</a>',
    '[Click](javascript:alert%281%29)',
    '[Click](jav&#x61;script:alert%281%29)',
    '![Image](data:image/svg+xml;base64,PHN2Zz4=)',
    '[Click](//attacker.example/path)',
  ])('does not emit active HTML or unsafe URLs for %s', (source) => {
    const { contentHtml } = service.render(source);
    expect(contentHtml).not.toMatch(/<(?:script|iframe|svg)\b/i);
    expect(contentHtml).not.toMatch(/<[^>]+\son\w+\s*=/i);
    expect(contentHtml).not.toMatch(/<[^>]+\s(?:href|src)="(?:javascript:|data:|\/\/)/i);
  });

  it('keeps raw HTML disabled while preserving it as inert text', () => {
    const { contentHtml } = service.render('<b>Not interpreted</b>');
    expect(contentHtml).not.toContain('<b>');
    expect(contentHtml).toContain('&lt;b&gt;');
  });

  it('uses stable, unique Unicode heading ids and resets state between renders', () => {
    const markdown = '# 中文标题\n\n## 中文标题\n\n### !!!\n\n## 中文标题';
    const first = service.render(markdown);
    expect(first.toc.map((item) => item.id)).toEqual([
      '中文标题',
      '中文标题-2',
      'section',
      '中文标题-3',
    ]);
    expect(service.render(markdown)).toEqual(first);
  });

  it('never executes code-fence or inline-code content as HTML', () => {
    const { contentHtml } = service.render(
      '`<img onerror="bad()">`\n\n```html\n<script>bad()</script>\n```',
    );
    expect(contentHtml).toContain('&lt;script&gt;');
    expect(contentHtml).not.toContain('<script>');
    expect(contentHtml).not.toContain('<img');
  });
});
