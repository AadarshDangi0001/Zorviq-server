export class CodeValidatorService {
  private readonly DANGEROUS_PATTERNS = [
    /parent\./i,
    /window\.top/i,
    /document\.cookie/i,
    /window\.location/i,
    /localStorage/i,
    /sessionStorage/i,
    /eval\s*\(/i,
    /Function\s*\(/i,
  ];
 
  private readonly FORBIDDEN_TAGS = [
    /<html[\s>]/i,
    /<head[\s>]/i,
    /<body[\s>]/i,
  ];
 
  isValid(code: string): boolean {
    if (!code || code.trim().length < 20) return false;
 
    // Reject if contains forbidden root tags
    if (this.FORBIDDEN_TAGS.some((p) => p.test(code))) return false;
 
    // Reject if contains dangerous escape patterns
    if (this.DANGEROUS_PATTERNS.some((p) => p.test(code))) return false;
 
    // Must contain at least one data-section-id (system prompt rule)
    if (!code.includes("data-section-id")) return false;
 
    return true;
  }
 
  sanitize(code: string): string {
    return (
      code
        // Remove <script> blocks entirely
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        // Strip inline event handlers
        .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
        .replace(/\son\w+\s*=\s*`[^`]*`/gi, "")
        // Remove dangerous HTML root tags
        .replace(/<\/?(html|head|body)[^>]*>/gi, "")
        // Strip dangerous JS patterns
        .replace(/parent\./gi, "/* blocked */")
        .replace(/window\.top/gi, "/* blocked */")
        .trim()
    );
  }
}