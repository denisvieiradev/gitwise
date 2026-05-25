export interface DocRow {
  code: number;
  constant: string;
  lineNumber: number;
}

export interface ParityDiff {
  missingFromDoc: Array<{ constant: string; code: number }>;
  extraInDoc: Array<{ constant: string; code: number; lineNumber: number }>;
  mismatched: Array<{
    constant: string;
    docCode: number;
    sourceCode: number;
    lineNumber: number;
  }>;
}

const DELIMITER_ROW = /^\s*\|?[\s\-:|]+\|?\s*$/;
const HEADER_KEYWORDS = ["code", "constant"];

function isDelimiterRow(line: string): boolean {
  if (!line.includes("-")) return false;
  return DELIMITER_ROW.test(line);
}

function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

export function parseExitCodesDoc(markdown: string): DocRow[] {
  const lines = markdown.split(/\r?\n/);
  const rows: DocRow[] = [];

  let headerLineIdx = -1;
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    if (!line.includes("|")) continue;
    const cells = splitCells(line).map((c) => c.toLowerCase());
    if (HEADER_KEYWORDS.every((k) => cells.includes(k)) && isDelimiterRow(next)) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx === -1) {
    throw new Error(
      "parseExitCodesDoc: could not find a markdown table whose header includes 'Code' and 'Constant'.",
    );
  }

  const headerCells = splitCells(lines[headerLineIdx] ?? "").map((c) => c.toLowerCase());
  const codeIdx = headerCells.indexOf("code");
  const constantIdx = headerCells.indexOf("constant");

  for (let i = headerLineIdx + 2; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (raw.trim() === "") break;
    if (!raw.includes("|")) break;
    if (isDelimiterRow(raw)) continue;

    const cells = splitCells(raw);
    const codeCell = cells[codeIdx];
    const constantCell = cells[constantIdx];
    if (codeCell === undefined || constantCell === undefined) {
      throw new Error(
        `parseExitCodesDoc: malformed row at line ${i + 1}: ${JSON.stringify(raw)}`,
      );
    }

    const code = Number.parseInt(codeCell, 10);
    if (!Number.isFinite(code)) {
      throw new Error(
        `parseExitCodesDoc: non-numeric Code at line ${i + 1}: ${JSON.stringify(codeCell)}`,
      );
    }

    const backtickMatch = /`([A-Z0-9_]+)`/.exec(constantCell);
    const constant = backtickMatch?.[1];
    if (constant === undefined) {
      throw new Error(
        `parseExitCodesDoc: Constant cell at line ${i + 1} must wrap the constant name in backticks: ${JSON.stringify(constantCell)}`,
      );
    }

    rows.push({ code, constant, lineNumber: i + 1 });
  }

  if (rows.length === 0) {
    throw new Error("parseExitCodesDoc: table found but had zero data rows.");
  }

  return rows;
}

export function diffAgainstSource(
  docRows: DocRow[],
  source: Readonly<Record<string, number>>,
): ParityDiff {
  const docByConstant = new Map<string, DocRow>();
  for (const row of docRows) docByConstant.set(row.constant, row);

  const missingFromDoc: ParityDiff["missingFromDoc"] = [];
  const mismatched: ParityDiff["mismatched"] = [];
  for (const [constant, code] of Object.entries(source)) {
    const docRow = docByConstant.get(constant);
    if (docRow === undefined) {
      missingFromDoc.push({ constant, code });
      continue;
    }
    if (docRow.code !== code) {
      mismatched.push({
        constant,
        docCode: docRow.code,
        sourceCode: code,
        lineNumber: docRow.lineNumber,
      });
    }
  }

  const extraInDoc: ParityDiff["extraInDoc"] = [];
  for (const row of docRows) {
    if (!(row.constant in source)) {
      extraInDoc.push({ constant: row.constant, code: row.code, lineNumber: row.lineNumber });
    }
  }

  return { missingFromDoc, extraInDoc, mismatched };
}

export function formatDiff(diff: ParityDiff): string {
  const lines: string[] = [];
  if (diff.missingFromDoc.length > 0) {
    lines.push("missing from docs/exit-codes.md (present in EXIT_CODES):");
    for (const m of diff.missingFromDoc) lines.push(`  - ${m.constant} = ${m.code}`);
  }
  if (diff.extraInDoc.length > 0) {
    lines.push("extra in docs/exit-codes.md (absent from EXIT_CODES):");
    for (const m of diff.extraInDoc)
      lines.push(`  - ${m.constant} = ${m.code} (line ${m.lineNumber})`);
  }
  if (diff.mismatched.length > 0) {
    lines.push("numeric mismatch between docs and EXIT_CODES:");
    for (const m of diff.mismatched)
      lines.push(
        `  - ${m.constant}: docs=${m.docCode} vs EXIT_CODES=${m.sourceCode} (line ${m.lineNumber})`,
      );
  }
  return lines.join("\n");
}

export function isClean(diff: ParityDiff): boolean {
  return (
    diff.missingFromDoc.length === 0 &&
    diff.extraInDoc.length === 0 &&
    diff.mismatched.length === 0
  );
}
