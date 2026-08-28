// Hand-written because the module itself has to stay plain Node ESM: the verify
// scripts are run directly by `node`, with no build step, while the test that
// covers the patterns is TypeScript. Keep the two in step by hand.

export interface SourceHazardPattern {
  readonly pattern: RegExp;
  readonly label: string;
  readonly remedy: string;
}

export interface BundleHazardPattern {
  readonly pattern: RegExp;
  readonly reason: string;
}

export interface SourceHazard {
  readonly file: string;
  readonly line: number;
  readonly label: string;
  readonly remedy: string;
  readonly text: string;
}

export const sourceHazardPatterns: readonly SourceHazardPattern[];
export const bundleHazardPatterns: readonly BundleHazardPattern[];

export function findSourceHazards(
  source: string,
  relativePath: string,
): SourceHazard[];

export function formatSourceHazard(hazard: SourceHazard): string;
