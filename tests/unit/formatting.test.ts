/**
 * Unit tests for formatting module.
 * Tests markdown→HTML conversion and tool status formatting.
 */

import { describe, test, expect } from "bun:test";
import {
  escapeHtml,
  convertMarkdownToHtml,
  formatToolStatus,
} from "../../src/formatting";

// ============== escapeHtml ==============

describe("escapeHtml", () => {
  test("escapes & < > \"", () => {
    expect(escapeHtml('foo & <bar> "baz"')).toBe(
      "foo &amp; &lt;bar&gt; &quot;baz&quot;"
    );
  });

  test("leaves plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  test("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

// ============== convertMarkdownToHtml ==============

describe("convertMarkdownToHtml", () => {
  test("converts **bold**", () => {
    expect(convertMarkdownToHtml("**hello**")).toBe("<b>hello</b>");
  });

  test("converts *bold* (single asterisk)", () => {
    expect(convertMarkdownToHtml("*hello*")).toBe("<b>hello</b>");
  });

  test("converts _italic_", () => {
    expect(convertMarkdownToHtml("_hello_")).toBe("<i>hello</i>");
  });

  test("converts __bold__ (double underscore)", () => {
    expect(convertMarkdownToHtml("__hello__")).toBe("<b>hello</b>");
  });

  test("converts inline code", () => {
    expect(convertMarkdownToHtml("`code`")).toBe("<code>code</code>");
  });

  test("converts code blocks", () => {
    const input = "```js\nconst x = 1;\n```";
    const result = convertMarkdownToHtml(input);
    expect(result).toContain("<pre>");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("</pre>");
  });

  test("escapes HTML inside code blocks", () => {
    const input = "```\n<script>alert('xss')</script>\n```";
    const result = convertMarkdownToHtml(input);
    expect(result).toContain("&lt;script&gt;");
    expect(result).not.toContain("<script>");
  });

  test("converts headers to bold", () => {
    expect(convertMarkdownToHtml("## Header")).toContain("<b>Header</b>");
  });

  test("converts bullet lists", () => {
    expect(convertMarkdownToHtml("- item")).toBe("• item");
    expect(convertMarkdownToHtml("* item")).toBe("• item");
  });

  test("converts links", () => {
    expect(convertMarkdownToHtml("[text](http://url)")).toBe(
      '<a href="http://url">text</a>'
    );
  });

  test("converts blockquotes", () => {
    expect(convertMarkdownToHtml("> quoted text")).toContain("<blockquote>");
  });

  test("collapses multiple newlines", () => {
    const result = convertMarkdownToHtml("a\n\n\n\nb");
    expect(result).not.toContain("\n\n\n");
  });

  test("handles mixed formatting", () => {
    const input = "**bold** and `code` and _italic_";
    const result = convertMarkdownToHtml(input);
    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("<code>code</code>");
    expect(result).toContain("<i>italic</i>");
  });
});

// ============== formatToolStatus ==============

describe("formatToolStatus", () => {
  test("formats Read tool", () => {
    const result = formatToolStatus("Read", { file_path: "/home/user/project/src/index.ts" });
    expect(result).toContain("📖");
    expect(result).toContain("src/index.ts");
  });

  test("formats Read for images as 'Viewing'", () => {
    const result = formatToolStatus("Read", { file_path: "/home/user/photo.png" });
    expect(result).toBe("👀 Viewing");
  });

  test("formats Write tool", () => {
    const result = formatToolStatus("Write", { file_path: "/home/user/test.ts" });
    expect(result).toContain("📝");
    expect(result).toContain("test.ts");
  });

  test("formats Edit tool", () => {
    const result = formatToolStatus("Edit", { file_path: "/home/user/test.ts" });
    expect(result).toContain("✏️");
  });

  test("formats Bash with description", () => {
    const result = formatToolStatus("Bash", {
      command: "npm install",
      description: "Install dependencies",
    });
    expect(result).toContain("▶️");
    expect(result).toContain("Install dependencies");
  });

  test("formats Bash without description shows command", () => {
    const result = formatToolStatus("Bash", { command: "ls -la" });
    expect(result).toContain("ls -la");
  });

  test("formats Grep tool", () => {
    const result = formatToolStatus("Grep", { pattern: "TODO", path: "/src" });
    expect(result).toContain("🔎");
    expect(result).toContain("TODO");
  });

  test("formats Glob tool", () => {
    const result = formatToolStatus("Glob", { pattern: "**/*.ts" });
    expect(result).toContain("🔍");
    expect(result).toContain("**/*.ts");
  });

  test("formats MCP tools", () => {
    const result = formatToolStatus("mcp__server__action", { query: "test" });
    expect(result).toContain("🔧");
    expect(result).toContain("server");
  });

  test("truncates long commands", () => {
    const longCmd = "a".repeat(100);
    const result = formatToolStatus("Bash", { command: longCmd });
    expect(result.length).toBeLessThan(100);
  });
});
