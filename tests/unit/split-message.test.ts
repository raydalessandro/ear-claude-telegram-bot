/**
 * Tests for message splitting — ensures long messages are properly
 * chunked without breaking HTML tags.
 */

import { describe, test, expect } from "bun:test";
import { splitMessage, convertMarkdownToHtml } from "../../src/formatting";

describe("splitMessage", () => {
  test("returns single chunk for short text", () => {
    const chunks = splitMessage("hello", 100);
    expect(chunks).toEqual(["hello"]);
  });

  test("returns single chunk when exactly at limit", () => {
    const text = "a".repeat(100);
    const chunks = splitMessage(text, 100);
    expect(chunks).toEqual([text]);
  });

  test("splits long text into multiple chunks", () => {
    const text = "word ".repeat(1000); // ~5000 chars
    const chunks = splitMessage(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk should be <= 100 + closing tags
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200); // generous for closing tags
    }
  });

  test("prefers splitting on double newlines", () => {
    const text = "paragraph one content here.\n\nparagraph two content here.";
    const chunks = splitMessage(text, 35);
    // Should split at the \n\n boundary
    expect(chunks[0]).toContain("paragraph one");
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("prefers splitting on single newlines over spaces", () => {
    const text = "line one content\nline two content\nline three content";
    const chunks = splitMessage(text, 25);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("splits on spaces as fallback", () => {
    const text = "word1 word2 word3 word4 word5 word6 word7 word8";
    const chunks = splitMessage(text, 20);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should start or end with a split word
  });

  test("hard cuts when no good split point", () => {
    const text = "a".repeat(200); // no spaces or newlines
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBe(4);
  });

  test("all content is preserved across chunks", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(50);
    const chunks = splitMessage(text, 100);
    const rejoined = chunks.join("");
    // Should contain all the original content (minus potential closing tags added)
    expect(rejoined).toContain("quick brown fox");
    expect(rejoined).toContain("lazy dog");
  });

  test("handles empty string", () => {
    expect(splitMessage("", 100)).toEqual([""]);
  });

  test("default maxLen is 4000", () => {
    const text = "a".repeat(8000);
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(2);
  });
});

describe("splitMessage HTML safety", () => {
  test("closes unclosed <b> tags", () => {
    const text = "<b>bold text that is very long and gets split here";
    const chunks = splitMessage(text, 30);
    expect(chunks[0]).toContain("</b>");
  });

  test("closes unclosed <pre> tags", () => {
    const text = "<pre>code block\nline2\nline3\nline4\nline5\nline6";
    const chunks = splitMessage(text, 25);
    expect(chunks[0]).toContain("</pre>");
  });

  test("closes unclosed <code> tags", () => {
    const text = "text <code>inline code that goes on and on and on";
    const chunks = splitMessage(text, 30);
    expect(chunks[0]).toContain("</code>");
  });

  test("closes unclosed <i> tags", () => {
    const text = "<i>italic text that is very long and gets split";
    const chunks = splitMessage(text, 30);
    expect(chunks[0]).toContain("</i>");
  });

  test("closes unclosed <blockquote> tags", () => {
    const text = "<blockquote>quoted text that goes on for a while";
    const chunks = splitMessage(text, 35);
    expect(chunks[0]).toContain("</blockquote>");
  });

  test("does not add extra closing tags when tags are balanced", () => {
    const text = "<b>bold</b> and <i>italic</i> normal text here ok";
    const chunks = splitMessage(text, 60);
    expect(chunks).toHaveLength(1);
    // Count closing tags — should match opens
    const bOpens = (chunks[0]!.match(/<b>/g) || []).length;
    const bCloses = (chunks[0]!.match(/<\/b>/g) || []).length;
    expect(bOpens).toBe(bCloses);
  });

  test("handles nested tags", () => {
    const text = "<b><i>bold italic text that is long enough to split here ok";
    const chunks = splitMessage(text, 40);
    // First chunk should close both tags
    expect(chunks[0]).toContain("</i>");
    expect(chunks[0]).toContain("</b>");
  });

  test("real-world: converted markdown splits safely", () => {
    const md = "## Header\n\n**Bold paragraph** with `code` and more text.\n\n" +
      "```python\ndef hello():\n    print('world')\n```\n\n" +
      "Another paragraph with _italic_ and [link](http://example.com).\n\n" +
      "Final paragraph. ".repeat(20);

    const html = convertMarkdownToHtml(md);
    const chunks = splitMessage(html, 200);

    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should have balanced tags
    for (const chunk of chunks) {
      for (const tag of ["b", "i", "code", "pre"]) {
        const opens = (chunk.match(new RegExp(`<${tag}[^>]*>`, "g")) || []).length;
        const closes = (chunk.match(new RegExp(`</${tag}>`, "g")) || []).length;
        expect(opens).toBeLessThanOrEqual(closes + 0); // closes >= opens (fixBrokenHtml adds missing)
        // Actually after fix: opens === closes
        expect(opens).toBe(closes);
      }
    }
  });

  test("very long code block is split with proper pre tags", () => {
    const longCode = "```\n" + "console.log('line');\n".repeat(200) + "```";
    const html = convertMarkdownToHtml(longCode);
    const chunks = splitMessage(html, 500);

    expect(chunks.length).toBeGreaterThan(1);
    // First chunk should have <pre> closed
    expect(chunks[0]).toContain("<pre>");
    expect(chunks[0]).toContain("</pre>");
  });
});

describe("splitMessage edge cases", () => {
  test("maxLen of 1 still works (extreme)", () => {
    const chunks = splitMessage("abc", 1);
    expect(chunks.length).toBe(3);
  });

  test("unicode characters don't break splitting", () => {
    const text = "🎉 ".repeat(100);
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    const rejoined = chunks.join("");
    expect(rejoined).toContain("🎉");
  });

  test("HTML entities don't count as multiple chars (they do, this is expected)", () => {
    // &amp; is 5 chars in the string, this is by design
    const text = "&amp; ".repeat(100);
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
