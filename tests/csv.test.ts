import { describe, it, expect } from "vitest";
import { toCsv, type CsvColumn } from "@/lib/csv";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Row {
  name: string;
  amount: number;
  active: boolean;
  note: string | null | undefined;
  ts: Date | null;
}

const COLS: CsvColumn<Row>[] = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount" },
  { key: "active", label: "Active" },
  { key: "note", label: "Note" },
  { key: "ts", label: "Timestamp" },
];

const FIXED_DATE = new Date("2024-03-15T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe("header row", () => {
  it("produces column labels as first line", () => {
    const csv = toCsv(COLS, []);
    expect(csv.split("\r\n")[0]).toBe("Name,Amount,Active,Note,Timestamp");
  });

  it("returns header only when rows array is empty (no trailing CRLF)", () => {
    const csv = toCsv(COLS, []);
    expect(csv).toBe("Name,Amount,Active,Note,Timestamp");
    expect(csv.endsWith("\r\n")).toBe(false);
  });

  it("quotes a label that contains a comma", () => {
    const cols: CsvColumn<{ v: string }>[] = [
      { key: "v", label: "A,B" },
    ];
    expect(toCsv(cols, []).split("\r\n")[0]).toBe('"A,B"');
  });
});

// ---------------------------------------------------------------------------
// Simple rows
// ---------------------------------------------------------------------------

describe("simple rows", () => {
  it("emits one line per row after the header", () => {
    const csv = toCsv(COLS, [
      { name: "Alice", amount: 10, active: true, note: "ok", ts: null },
      { name: "Bob", amount: 20, active: false, note: "fine", ts: null },
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("writes fields in columns order", () => {
    const csv = toCsv(COLS, [
      { name: "Alice", amount: 42, active: true, note: "hi", ts: FIXED_DATE },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(`Alice,42,true,hi,${FIXED_DATE.toISOString()}`);
  });

  it("does not emit a trailing CRLF after the last row", () => {
    const csv = toCsv(COLS, [
      { name: "X", amount: 1, active: false, note: null, ts: null },
    ]);
    expect(csv.endsWith("\r\n")).toBe(false);
  });

  it("uses CRLF (not LF) between lines", () => {
    const csv = toCsv(COLS, [
      { name: "A", amount: 1, active: true, note: null, ts: null },
      { name: "B", amount: 2, active: false, note: null, ts: null },
    ]);
    const crlfCount = (csv.match(/\r\n/g) ?? []).length;
    // header→row1 + row1→row2
    expect(crlfCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Quoting — comma in field
// ---------------------------------------------------------------------------

describe("quoting: comma in field", () => {
  it("wraps field in double quotes when it contains a comma", () => {
    interface R { v: string }
    const cols: CsvColumn<R>[] = [{ key: "v", label: "Val" }];
    const csv = toCsv(cols, [{ v: "a,b" }]);
    expect(csv.split("\r\n")[1]).toBe('"a,b"');
  });
});

// ---------------------------------------------------------------------------
// Quoting — double-quote in field
// ---------------------------------------------------------------------------

describe("quoting: double-quote in field", () => {
  it("wraps field and escapes embedded quotes as double double-quotes", () => {
    interface R { v: string }
    const cols: CsvColumn<R>[] = [{ key: "v", label: "Val" }];
    const csv = toCsv(cols, [{ v: 'say "hello"' }]);
    expect(csv.split("\r\n")[1]).toBe('"say ""hello"""');
  });

  it("escapes multiple embedded quotes", () => {
    interface R { v: string }
    const cols: CsvColumn<R>[] = [{ key: "v", label: "Val" }];
    const csv = toCsv(cols, [{ v: '"a""b"' }]);
    expect(csv.split("\r\n")[1]).toBe('"""a""""b"""');
  });
});

// ---------------------------------------------------------------------------
// Quoting — newline / CR in field
// ---------------------------------------------------------------------------

describe("quoting: LF in field", () => {
  it("wraps field when it contains a newline character", () => {
    interface R { v: string }
    const cols: CsvColumn<R>[] = [{ key: "v", label: "Val" }];
    const csv = toCsv(cols, [{ v: "line1\nline2" }]);
    expect(csv.split("\r\n")[1]).toBe('"line1\nline2"');
  });
});

describe("quoting: CR in field", () => {
  it("wraps field when it contains a carriage-return character", () => {
    interface R { v: string }
    const cols: CsvColumn<R>[] = [{ key: "v", label: "Val" }];
    const csv = toCsv(cols, [{ v: "line1\rline2" }]);
    expect(csv.split("\r\n")[1]).toBe('"line1\rline2"');
  });
});

// ---------------------------------------------------------------------------
// null / undefined → empty string
// ---------------------------------------------------------------------------

describe("null and undefined", () => {
  it("renders null as empty string", () => {
    interface R { v: null }
    const cols: CsvColumn<R>[] = [{ key: "v", label: "V" }];
    const csv = toCsv(cols, [{ v: null }]);
    expect(csv.split("\r\n")[1]).toBe("");
  });

  it("renders undefined as empty string", () => {
    interface R { v: undefined }
    const cols: CsvColumn<R>[] = [{ key: "v", label: "V" }];
    const csv = toCsv(cols, [{ v: undefined }]);
    expect(csv.split("\r\n")[1]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// number / boolean
// ---------------------------------------------------------------------------

describe("number formatting", () => {
  it("renders integer via String()", () => {
    interface R { n: number }
    const cols: CsvColumn<R>[] = [{ key: "n", label: "N" }];
    expect(toCsv(cols, [{ n: 42 }]).split("\r\n")[1]).toBe("42");
  });

  it("renders float via String()", () => {
    interface R { n: number }
    const cols: CsvColumn<R>[] = [{ key: "n", label: "N" }];
    expect(toCsv(cols, [{ n: 3.14 }]).split("\r\n")[1]).toBe("3.14");
  });

  it("renders negative numbers", () => {
    interface R { n: number }
    const cols: CsvColumn<R>[] = [{ key: "n", label: "N" }];
    expect(toCsv(cols, [{ n: -7 }]).split("\r\n")[1]).toBe("-7");
  });
});

describe("boolean formatting", () => {
  it("renders true as 'true'", () => {
    interface R { b: boolean }
    const cols: CsvColumn<R>[] = [{ key: "b", label: "B" }];
    expect(toCsv(cols, [{ b: true }]).split("\r\n")[1]).toBe("true");
  });

  it("renders false as 'false'", () => {
    interface R { b: boolean }
    const cols: CsvColumn<R>[] = [{ key: "b", label: "B" }];
    expect(toCsv(cols, [{ b: false }]).split("\r\n")[1]).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

describe("Date formatting", () => {
  it("renders a Date via toISOString()", () => {
    interface R { d: Date }
    const cols: CsvColumn<R>[] = [{ key: "d", label: "D" }];
    const d = new Date("2024-01-01T00:00:00.000Z");
    expect(toCsv(cols, [{ d }]).split("\r\n")[1]).toBe(d.toISOString());
  });
});

// ---------------------------------------------------------------------------
// empty rows → header only
// ---------------------------------------------------------------------------

describe("empty rows array", () => {
  it("returns exactly the header line with no CRLF", () => {
    const csv = toCsv(COLS, []);
    expect(csv).not.toContain("\r\n");
    expect(csv).toBe("Name,Amount,Active,Note,Timestamp");
  });
});

// ---------------------------------------------------------------------------
// Formula injection neutralization
// ---------------------------------------------------------------------------

describe("formula injection guard", () => {
  interface R { v: string }
  const cols: CsvColumn<R>[] = [{ key: "v", label: "Val" }];

  it("prefixes = formula trigger with a single quote", () => {
    // Value: =HYPERLINK("evil")
    // After neutralize: '=HYPERLINK("evil")  — contains " → RFC-4180 wrap + escape
    // Final: "'=HYPERLINK(""evil"")"
    const csv = toCsv(cols, [{ v: '=HYPERLINK("evil")' }]);
    expect(csv.split("\r\n")[1]).toBe(`"'=HYPERLINK(""evil"")"`);
  });

  it("prefixes + trigger with a single quote", () => {
    const csv = toCsv(cols, [{ v: "+1" }]);
    expect(csv.split("\r\n")[1]).toBe("'+1");
  });

  it("prefixes - trigger with a single quote", () => {
    const csv = toCsv(cols, [{ v: "-1" }]);
    expect(csv.split("\r\n")[1]).toBe("'-1");
  });

  it("prefixes @ trigger with a single quote", () => {
    const csv = toCsv(cols, [{ v: "@x" }]);
    expect(csv.split("\r\n")[1]).toBe("'@x");
  });

  it("prefixes leading-tab value with a single quote", () => {
    const csv = toCsv(cols, [{ v: "\tcmd" }]);
    expect(csv.split("\r\n")[1]).toBe("'\tcmd");
  });

  it("does not alter a normal value (no prefix added)", () => {
    const csv = toCsv(cols, [{ v: "Foo Bar" }]);
    expect(csv.split("\r\n")[1]).toBe("Foo Bar");
  });

  it("normal value with comma still gets RFC-4180 quoting but no injection prefix", () => {
    const csv = toCsv(cols, [{ v: "Foo, Bar" }]);
    expect(csv.split("\r\n")[1]).toBe('"Foo, Bar"');
  });

  it("formula-leading value that also contains a comma gets both prefix and RFC-4180 quoting", () => {
    // e.g. contractName = "=SUM(A1,B1)" — starts with = AND contains a comma
    const csv = toCsv(cols, [{ v: "=SUM(A1,B1)" }]);
    // After neutralizeFormula: "'=SUM(A1,B1)" — contains comma → wrapped in quotes
    expect(csv.split("\r\n")[1]).toBe(`"'=SUM(A1,B1)"`);
  });

  it("does not prefix number values (not formula vectors)", () => {
    interface N { n: number }
    const numCols: CsvColumn<N>[] = [{ key: "n", label: "N" }];
    // Negative number: should remain -7 not '-7
    const csv = toCsv(numCols, [{ n: -7 }]);
    expect(csv.split("\r\n")[1]).toBe("-7");
  });

  it("does not prefix boolean values", () => {
    interface B { b: boolean }
    const boolCols: CsvColumn<B>[] = [{ key: "b", label: "B" }];
    const csv = toCsv(boolCols, [{ b: false }]);
    expect(csv.split("\r\n")[1]).toBe("false");
  });

  it("neutralized value round-trips as text (single-quote prefix is present in output)", () => {
    const csv = toCsv(cols, [{ v: "=cmd" }]);
    const field = csv.split("\r\n")[1];
    expect(field.startsWith("'")).toBe(true);
    expect(field).toContain("=cmd");
  });
});
