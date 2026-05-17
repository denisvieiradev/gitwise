import type { ContextMode } from "./types.js";

export interface Document {
  name: string;
  content: string;
  priority: "high" | "medium" | "low";
}

const ESTIMATED_CHARS_PER_TOKEN = 4;
const LIGHT_MODE_TOKEN_LIMIT = 4000;
const LIGHT_MODE_CHAR_LIMIT = LIGHT_MODE_TOKEN_LIMIT * ESTIMATED_CHARS_PER_TOKEN;

export class ContextBuilder {
  build(documents: Document[], mode: ContextMode): string {
    if (mode === "normal") {
      return this.buildNormal(documents);
    }
    return this.buildLight(documents);
  }

  private buildNormal(documents: Document[]): string {
    return documents
      .map((doc) => `--- ${doc.name} ---\n${doc.content}`)
      .join("\n\n");
  }

  private buildLight(documents: Document[]): string {
    const sorted = [...documents].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
    let result = "";
    let charCount = 0;
    for (const doc of sorted) {
      const chunked = this.chunkByHeadings(doc.content);
      const docHeader = `--- ${doc.name} ---\n`;
      result += docHeader;
      charCount += docHeader.length;
      for (const section of chunked) {
        if (charCount + section.length > LIGHT_MODE_CHAR_LIMIT) {
          const truncated = this.truncateSection(section);
          result += truncated + "\n";
          charCount += truncated.length + 1;
          break;
        }
        result += section + "\n";
        charCount += section.length + 1;
      }
      result += "\n";
    }
    return result.trim();
  }

  private chunkByHeadings(content: string): string[] {
    const sections: string[] = [];
    let current = "";
    for (const line of content.split("\n")) {
      if (/^#{2,3}\s/.test(line) && current.trim()) {
        sections.push(current.trim());
        current = "";
      }
      current += line + "\n";
    }
    if (current.trim()) {
      sections.push(current.trim());
    }
    return sections;
  }

  private truncateSection(section: string): string {
    const lines = section.split("\n");
    const heading = lines[0] ?? "";
    const firstLine = lines[1] ?? "";
    return `${heading}\n${firstLine}\n[...]`;
  }
}
