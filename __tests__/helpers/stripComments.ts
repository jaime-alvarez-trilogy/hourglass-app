// Strips block and line comments from TypeScript source, so static-analysis tests match code
// only (a pattern named in a comment never counts as a use). Naive on purpose: a `//` inside a
// string literal is also stripped, which is fine for the hook sources these tests read.
//
// This is a helper module, not a suite: jest's testMatch only picks up `*.test.ts(x)`.

export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
