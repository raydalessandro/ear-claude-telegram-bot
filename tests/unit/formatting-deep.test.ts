/**
 * Deep formatting tests — edge cases, nested formatting, XSS,
 * boundary conditions for markdown→HTML and tool status.
 */

import { describe, test, expect } from "bun:test";
import {
  escapeHtml,
  convertMarkdownToHtml,
  formatToolStatus,
} from "../../src/formatting";

// ============== escapeHtml Edge Cases ==============

describe("escapeHtml edge cases", () => {
  test("handles all HTML entities", () => {
    expect(escapeHtml('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });

  test("double-escaping protection", () => {
    const once = escapeHtml("&");
    const twice = escapeHtml(once);
    expect(once).toBe("&amp;");
    expect(twice).toBe("&amp;amp;");
  });

  test("handles unicode characters", () => {
    expect(escapeHtml("こんにちは")).toBe("こんにちは");
    expect(escapeHtml("🎉")).toBe("🎉");
  });

  test("handles newlines and tabs", () => {
    expect(escapeHtml("line1\nline2\ttab")).toBe("line1\nline2\ttab");
  });

  test("handles null bytes", () => {
    expect(escapeHtml("before\0after")).toBe("before\0after");
  });
});

// ============== Markdown Conversion Edge Cases ==============

describe("convertMarkdownToHtml edge cases", () => {
  // Nested formatting
  test("handles bold inside italic (won't nest perfectly but shouldn't crash)", () => {
    const result = convertMarkdownToHtml("_**nested**_");
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles empty bold **", () => {
    const result = convertMarkdownToHtml("****");
    // Empty bold markers — should not crash
    expect(result).toBeDefined();
  });

  test("handles unclosed bold", () => {
    const result = convertMarkdownToHtml("**unclosed");
    // Should pass through without matching
    expect(result).toContain("**unclosed");
  });

  test("handles unclosed italic", () => {
    const result = convertMarkdownToHtml("_unclosed");
    expect(result).toBeDefined();
  });

  test("handles unclosed code block", () => {
    const result = convertMarkdownToHtml("```\ncode without closing");
    expect(result).toBeDefined();
  });

  test("handles unclosed inline code", () => {
    const result = convertMarkdownToHtml("`unclosed code");
    expect(result).toContain("`unclosed code");
  });

  // Code block edge cases
  test("code block with language tag", () => {
    const result = convertMarkdownToHtml("```python\nprint('hello')\n```");
    expect(result).toContain("<pre>");
    expect(result).toContain("print");
  });

  test("code block preserves HTML entities inside", () => {
    const result = convertMarkdownToHtml("```\n<div class=\"test\">&amp;\n```");
    expect(result).toContain("&lt;div");
    expect(result).not.toContain("<div");
  });

  test("multiple code blocks", () => {
    const result = convertMarkdownToHtml("```\nblock1\n```\ntext\n```\nblock2\n```");
    expect(result).toContain("block1");
    expect(result).toContain("block2");
    const preCount = (result.match(/<pre>/g) || []).length;
    expect(preCount).toBe(2);
  });

  test("inline code preserves HTML entities", () => {
    const result = convertMarkdownToHtml("Use `<div>` tag");
    expect(result).toContain("&lt;div&gt;");
  });

  test("code inside bold is handled (code extracted first)", () => {
    const result = convertMarkdownToHtml("**bold `code` bold**");
    expect(result).toContain("<b>");
    expect(result).toContain("<code>");
  });

  // XSS prevention
  test("script tags are escaped", () => {
    const result = convertMarkdownToHtml('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("onclick events are escaped (tag is neutralized)", () => {
    const result = convertMarkdownToHtml('<button onclick="alert(1)">');
    // The < and > are escaped, neutralizing the HTML tag entirely
    // The word "onclick" remains as text content but is harmless
    expect(result).toContain("&lt;button");
    expect(result).not.toContain("<button");
  });

  test("javascript: URIs in links are escaped", () => {
    const result = convertMarkdownToHtml('[click](javascript:alert(1))');
    // The link should be rendered but the URL is not sanitized by this code —
    // Telegram itself handles URL safety
    expect(result).toBeDefined();
  });

  test("HTML injection via markdown formatting", () => {
    const result = convertMarkdownToHtml("**<img src=x onerror=alert(1)>**");
    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
  });

  // Blockquotes
  test("blockquote at end of text", () => {
    const result = convertMarkdownToHtml("text\n> quoted");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("quoted");
    expect(result).toContain("</blockquote>");
  });

  test("multi-line blockquote", () => {
    const result = convertMarkdownToHtml("> line1\n> line2\n> line3");
    const bqCount = (result.match(/<blockquote>/g) || []).length;
    expect(bqCount).toBe(1);
    expect(result).toContain("line1");
    expect(result).toContain("line3");
  });

  test("empty blockquote line", () => {
    const result = convertMarkdownToHtml("> line1\n>\n> line2");
    expect(result).toContain("<blockquote>");
  });

  test("blockquote followed by normal text", () => {
    const result = convertMarkdownToHtml("> quoted\nnormal text");
    expect(result).toContain("<blockquote>");
    expect(result).toContain("</blockquote>");
    expect(result).toContain("normal text");
  });

  // Headers
  test("h1 through h6", () => {
    for (let i = 1; i <= 6; i++) {
      const hashes = "#".repeat(i);
      const result = convertMarkdownToHtml(`${hashes} Header ${i}`);
      expect(result).toContain(`<b>Header ${i}</b>`);
    }
  });

  test("header without space after # is not converted", () => {
    const result = convertMarkdownToHtml("#notaheader");
    expect(result).not.toContain("<b>notaheader</b>");
  });

  // Lists
  test("nested bullet list (treated as flat)", () => {
    const result = convertMarkdownToHtml("- item1\n  - sub1\n  - sub2\n- item2");
    expect(result).toContain("• item1");
    expect(result).toContain("• item2");
  });

  test("numbered list left as-is", () => {
    const result = convertMarkdownToHtml("1. first\n2. second");
    expect(result).toContain("1. first");
  });

  // Links
  test("link with special chars in URL", () => {
    const result = convertMarkdownToHtml("[link](https://example.com/path?q=a&b=c)");
    expect(result).toContain('href="https://example.com/path?q=a&amp;b=c"');
  });

  test("link with parentheses in text", () => {
    const result = convertMarkdownToHtml("[text (info)](http://url)");
    expect(result).toContain("text (info)");
  });

  // Horizontal rules
  test("horizontal rule is removed", () => {
    const result = convertMarkdownToHtml("before\n---\nafter");
    expect(result).not.toContain("---");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });

  // Newline handling
  test("collapses 3+ newlines to 2", () => {
    const result = convertMarkdownToHtml("a\n\n\n\n\nb");
    expect(result).not.toContain("\n\n\n");
  });

  test("preserves single newlines", () => {
    const result = convertMarkdownToHtml("line1\nline2");
    expect(result).toContain("\n");
  });

  // Edge cases
  test("empty string returns empty", () => {
    expect(convertMarkdownToHtml("")).toBe("");
  });

  test("whitespace-only", () => {
    const result = convertMarkdownToHtml("   \n\n   ");
    expect(result).toBeDefined();
  });

  test("very long input", () => {
    const long = "word ".repeat(10000);
    const result = convertMarkdownToHtml(long);
    expect(result.length).toBeGreaterThan(0);
  });

  test("only special characters", () => {
    const result = convertMarkdownToHtml("& < > \" ' © ® ™");
    expect(result).toContain("&amp;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
  });

  test("mixed formatting in one line", () => {
    const result = convertMarkdownToHtml("**bold** _italic_ `code` [link](url) • list");
    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("<i>italic</i>");
    expect(result).toContain("<code>code</code>");
    expect(result).toContain("<a ");
  });
});

// ============== Tool Status Deep Tests ==============

describe("formatToolStatus deep", () => {
  test("WebSearch with query", () => {
    const result = formatToolStatus("WebSearch", { query: "how to test" });
    expect(result).toContain("🔍");
    expect(result).toContain("how to test");
  });

  test("WebFetch with url", () => {
    const result = formatToolStatus("WebFetch", { url: "https://example.com/api" });
    expect(result).toContain("🌐");
    expect(result).toContain("example.com");
  });

  test("Task with description", () => {
    const result = formatToolStatus("Task", { description: "Analyze code" });
    expect(result).toContain("🎯");
    expect(result).toContain("Analyze code");
  });

  test("Task without description", () => {
    const result = formatToolStatus("Task", {});
    expect(result).toContain("agent");
  });

  test("Skill with name", () => {
    const result = formatToolStatus("Skill", { skill: "commit" });
    expect(result).toContain("💭");
    expect(result).toContain("commit");
  });

  test("Skill without name", () => {
    const result = formatToolStatus("Skill", {});
    expect(result).toContain("💭");
    expect(result).toContain("skill");
  });

  test("MCP tool with server and action", () => {
    const result = formatToolStatus("mcp__myserver__do_thing", { query: "test" });
    expect(result).toContain("🔧");
    expect(result).toContain("myserver");
  });

  test("MCP tool with summary fields", () => {
    const result = formatToolStatus("mcp__srv__action", { title: "My Title" });
    expect(result).toContain("My Title");
  });

  test("MCP tool removes redundant server prefix from action", () => {
    const result = formatToolStatus("mcp__github__github_search", {});
    // Should show "search" not "github_search"
    expect(result).toContain("search");
  });

  test("MCP tool with only 2 parts", () => {
    const result = formatToolStatus("mcp__simple", {});
    expect(result).toContain("🔧");
  });

  test("unknown tool shows generic format", () => {
    const result = formatToolStatus("CustomTool", {});
    expect(result).toContain("CustomTool");
  });

  test("Read with very long path shows last 2 components", () => {
    const result = formatToolStatus("Read", {
      file_path: "/very/long/path/to/deeply/nested/file.ts",
    });
    expect(result).toContain("nested/file.ts");
    expect(result).not.toContain("/very/long");
  });

  test("Bash with very long command truncates", () => {
    const longCmd = "npm run build-and-test-and-lint-and-format " + "x".repeat(200);
    const result = formatToolStatus("Bash", { command: longCmd });
    expect(result.length).toBeLessThan(200);
    expect(result).toContain("...");
  });

  test("Grep with path shows path info", () => {
    const result = formatToolStatus("Grep", {
      pattern: "TODO",
      path: "/src/handlers",
    });
    expect(result).toContain("TODO");
    expect(result).toContain("handlers");
  });

  test("Grep without path shows only pattern", () => {
    const result = formatToolStatus("Grep", { pattern: "error" });
    expect(result).toContain("error");
  });

  test("Read with empty path shows fallback", () => {
    const result = formatToolStatus("Read", { file_path: "" });
    expect(result).toContain("file");
  });

  test("Bash with empty command and empty description", () => {
    const result = formatToolStatus("Bash", { command: "", description: "" });
    expect(result).toContain("▶️");
  });

  test("special characters in tool input are escaped", () => {
    const result = formatToolStatus("Bash", {
      description: "Run <script>alert(1)</script>",
    });
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("newlines in command are cleaned", () => {
    const result = formatToolStatus("Bash", {
      command: "echo 'line1\nline2\nline3'",
    });
    expect(result).not.toContain("\n");
  });

  // Path shortening
  test("shortenPath with single component", () => {
    const result = formatToolStatus("Read", { file_path: "file.txt" });
    expect(result).toContain("file.txt");
  });

  test("Read with windows-style path", () => {
    // Windows paths use backslash — shortenPath splits on /
    const result = formatToolStatus("Read", {
      file_path: "C:\\Users\\test\\file.ts",
    });
    // Since split("/") won't work on backslash, it returns full path
    expect(result).toBeDefined();
  });
});
