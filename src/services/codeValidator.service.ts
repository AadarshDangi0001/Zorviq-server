export interface CodeValidationOptions {
  allowFragment?: boolean;
}

export interface CodeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const TAILWIND_CLASS_HINTS = [
  "bg-",
  "text-",
  "flex",
  "grid",
  "rounded",
  "shadow",
  "hover:",
  "md:",
  "lg:",
  "px-",
  "py-",
  "mx-",
  "my-",
  "from-",
  "to-",
  "via-",
];

export class CodeValidatorService {
  private readonly dangerousPatterns = [
    { pattern: /document\.cookie/i, message: "Access to document.cookie is not allowed." },
    { pattern: /window\.top/i, message: "Access to window.top is not allowed." },
    { pattern: /parent\./i, message: "Access to parent frames is not allowed." },
    { pattern: /localStorage/i, message: "localStorage access is not allowed." },
    { pattern: /sessionStorage/i, message: "sessionStorage access is not allowed." },
    { pattern: /eval\s*\(/i, message: "eval() is not allowed." },
    { pattern: /new\s+Function\s*\(/i, message: "Function constructor is not allowed." },
    { pattern: /javascript:/i, message: "javascript: URLs are not allowed." },
    { pattern: /\bfetch\s*\(/i, message: "Network fetch calls are not allowed in generated HTML." },
    { pattern: /XMLHttpRequest/i, message: "XHR calls are not allowed in generated HTML." },
  ];

  sanitize(code: string, options: CodeValidationOptions = {}): string {
    const unwrapped = this.unwrapModelOutput(code);
    const normalized = unwrapped
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\//g, "/")
      .replace(/\r\n?/g, "\n")
      .replace(/^\uFEFF/, "")
      .replace(/\bhover:scale-103\b/g, "hover:scale-[1.03]")
      .replace(/\bscale-103\b/g, "scale-[1.03]")
      .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
      .replace(/\son\w+\s*=\s*`[^`]*`/gi, "")
      .replace(/\s(href|src)\s*=\s*["']javascript:[^"']*["']/gi, "")
      .trim();

    const withDependencies = options.allowFragment
      ? normalized
      : this.ensureStandaloneDocument(normalized);

    return this.repairTagBalance(withDependencies).trim();
  }

  isValid(code: string, options: CodeValidationOptions = {}): boolean {
    return this.validate(code, options).valid;
  }

  validate(code: string, options: CodeValidationOptions = {}): CodeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const trimmed = code.trim();

    if (!trimmed || trimmed.length < 20) {
      errors.push("Generated HTML is too short.");
    }

    if (/\\n|\\"/.test(trimmed)) {
      errors.push("Generated HTML contains escaped newline or quote sequences.");
    }

    for (const issue of this.dangerousPatterns) {
      if (issue.pattern.test(trimmed)) {
        errors.push(issue.message);
      }
    }

    if (/\son\w+\s*=/.test(trimmed)) {
      errors.push("Inline event handlers are not allowed.");
    }

    if (!options.allowFragment) {
      if (!/^<!doctype html>/i.test(trimmed)) {
        errors.push("Standalone output must begin with <!DOCTYPE html>.");
      }
      for (const tag of ["html", "head", "body"]) {
        if (!new RegExp(`<${tag}[\\s>]`, "i").test(trimmed)) {
          errors.push(`Standalone output is missing <${tag}>.`);
        }
        if (!new RegExp(`</${tag}>`, "i").test(trimmed)) {
          errors.push(`Standalone output is missing </${tag}>.`);
        }
      }
    }

    const usesTailwind = this.usesTailwindClasses(trimmed);
    const hasTailwindCdn = /cdn\.tailwindcss\.com/i.test(trimmed);
    if (usesTailwind && !hasTailwindCdn) {
      errors.push("Tailwind utility classes are present but Tailwind CDN is missing.");
    }

    if (/\b(?:hover:)?scale-103\b/.test(trimmed)) {
      errors.push("Invalid Tailwind scale-103 class is present.");
    }

    const externalAssetErrors = this.validateExternalAssets(trimmed);
    errors.push(...externalAssetErrors);

    const nestingErrors = this.validateTagNesting(trimmed, options);
    errors.push(...nestingErrors);

    if (!options.allowFragment && !/<title>[^<]+<\/title>/i.test(trimmed)) {
      warnings.push("Standalone output should include a non-empty <title>.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private unwrapModelOutput(code: string): string {
    let output = code.trim();

    const fenceMatch = output.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      output = fenceMatch[1].trim();
    }

    if (
      (output.startsWith('"') && output.endsWith('"')) ||
      (output.startsWith("{") && output.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(output) as unknown;
        if (typeof parsed === "string") {
          return parsed;
        }
        if (parsed && typeof parsed === "object") {
          const record = parsed as Record<string, unknown>;
          const html =
            record.html ??
            record.code ??
            record.output ??
            record.content ??
            record.data;
          if (typeof html === "string") {
            return html;
          }
        }
      } catch {
        return output;
      }
    }

    return output;
  }

  private ensureStandaloneDocument(code: string): string {
    const hasHtml = /<html[\s>]/i.test(code);
    const hasHead = /<head[\s>]/i.test(code);
    const hasBody = /<body[\s>]/i.test(code);

    if (hasHtml && hasHead && hasBody) {
      return this.ensureTailwindCdn(code);
    }

    const title = this.extractHeadingTitle(code);
    const bodyContent = code
      .replace(/^<!doctype html>\s*/i, "")
      .replace(/<\/?(html|head|body)[^>]*>/gi, "")
      .trim();

    return [
      "<!DOCTYPE html>",
      '<html lang="en">',
      "<head>",
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `  <title>${this.escapeText(title)}</title>`,
      '  <script src="https://cdn.tailwindcss.com"></script>',
      "</head>",
      '<body class="antialiased">',
      bodyContent,
      "</body>",
      "</html>",
    ].join("\n");
  }

  private ensureTailwindCdn(code: string): string {
    if (!this.usesTailwindClasses(code) || /cdn\.tailwindcss\.com/i.test(code)) {
      return code;
    }

    const script = '  <script src="https://cdn.tailwindcss.com"></script>';
    if (/<\/head>/i.test(code)) {
      return code.replace(/<\/head>/i, `${script}\n</head>`);
    }

    return code.replace(/<body[^>]*>/i, `${script}\n$&`);
  }

  private extractHeadingTitle(code: string): string {
    const heading = code.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const cleaned = heading?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return cleaned || "Generated Website";
  }

  private escapeText(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private usesTailwindClasses(code: string): boolean {
    const classValues = Array.from(code.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi));
    return classValues.some((match) =>
      TAILWIND_CLASS_HINTS.some((hint) => match[1].includes(hint))
    );
  }

  private validateExternalAssets(code: string): string[] {
    const errors: string[] = [];
    const assetPattern = /<(script|link|img|iframe|source)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
    for (const match of code.matchAll(assetPattern)) {
      const tag = match[1].toLowerCase();
      const url = match[2];
      if (
        url.startsWith("data:") ||
        url.startsWith("#") ||
        url.startsWith("mailto:") ||
        url.startsWith("tel:")
      ) {
        continue;
      }
      if (/^(?:script|main|app)\.js$/i.test(url)) {
        errors.push(`Referenced script file does not exist inline: ${url}.`);
      }
      if (!/^https:\/\//i.test(url) && !url.startsWith("/")) {
        errors.push(`${tag} dependency must use https:// or be an absolute app path: ${url}.`);
      }
    }
    return errors;
  }

  private repairTagBalance(code: string): string {
    const stack: string[] = [];
    const output: string[] = [];
    const tagPattern = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^<>]*)?>/gi;
    let cursor = 0;

    for (const match of code.matchAll(tagPattern)) {
      output.push(code.slice(cursor, match.index));
      const fullTag = match[0];
      const tagName = match[1]?.toLowerCase();
      cursor = (match.index ?? 0) + fullTag.length;

      if (!tagName || fullTag.startsWith("<!--") || /^<!doctype/i.test(fullTag)) {
        output.push(fullTag);
        continue;
      }

      if (fullTag.startsWith("</")) {
        const top = stack.at(-1);
        if (top === tagName) {
          stack.pop();
          output.push(fullTag);
          continue;
        }

        const matchingIndex = stack.lastIndexOf(tagName);
        if (matchingIndex === -1) {
          continue;
        }

        while (stack.length > matchingIndex + 1) {
          output.push(`</${stack.pop()}>`);
        }
        stack.pop();
        output.push(fullTag);
        continue;
      }

      output.push(fullTag);
      if (!VOID_TAGS.has(tagName) && !fullTag.endsWith("/>")) {
        stack.push(tagName);
      }
    }

    output.push(code.slice(cursor));

    while (stack.length > 0) {
      const tag = stack.pop();
      if (tag) {
        output.push(`</${tag}>`);
      }
    }

    return output.join("");
  }

  private validateTagNesting(
    code: string,
    _options: CodeValidationOptions
  ): string[] {
    const errors: string[] = [];
    const stack: string[] = [];
    const tagPattern = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)(?:\s[^<>]*)?>/gi;

    for (const match of code.matchAll(tagPattern)) {
      const fullTag = match[0];
      const tagName = match[1]?.toLowerCase();

      if (!tagName || fullTag.startsWith("<!--") || /^<!doctype/i.test(fullTag)) {
        continue;
      }

      if (fullTag.startsWith("</")) {
        const expected = stack.pop();
        if (expected !== tagName) {
          errors.push(`Mismatched closing tag </${tagName}>.`);
        }
        continue;
      }

      if (!VOID_TAGS.has(tagName) && !fullTag.endsWith("/>")) {
        stack.push(tagName);
      }
    }

    if (stack.length > 0) {
      errors.push(`Unclosed tag <${stack.at(-1)}>.`);
    }

    return errors;
  }
}
