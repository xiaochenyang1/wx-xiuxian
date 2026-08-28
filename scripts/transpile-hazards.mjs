/**
 * Constructs that are correct TypeScript, pass `pnpm test`, and misbehave only
 * after the Cocos build has transpiled them. Both known members of the family
 * shipped before anyone noticed, because every gate that could have seen them
 * reads either the source (where they are fine) or a bundle (which CI has no
 * Cocos Creator to produce).
 *
 * The lowering behind the iterator rule: array and call spread become
 * `[].concat(...)`, which appends a non-array as a single element instead of
 * expanding it. `[...map.entries()]` is therefore `[Iterator]` at runtime, the
 * one and only element destructures to `undefined` in every field, and the
 * player sees a label full of "undefined". `for...of` is safe by contrast — the
 * build routes it through `createForOfIteratorHelperLoose`, which honours
 * `Symbol.iterator`.
 *
 * Two stages, one rule. The source patterns are the ones that matter, because
 * they run on every push; the bundle patterns are the backstop for the forms a
 * source regex cannot see, such as a spread of a call that returns an iterator
 * or of a variable whose type is not visible in the text.
 */

/** Scanned against `assets/scripts` and `shared/src` by `verify:source`. */
export const sourceHazardPatterns = [
  {
    // Empty parentheses are the whole trick for keeping Object.entries,
    // Object.keys and Object.values out: those take an argument and return a
    // real array, which `[].concat` expands correctly. Array.prototype.entries
    // and friends do match, and should — they return iterators too.
    pattern: /\.\.\.\s*[A-Za-z_$][\w$.]*\.(?:entries|keys|values)\(\)/,
    label: "spread of an iterator",
    remedy: "collect with Map/Set forEach, or Array.from(...)",
  },
  {
    // `[...new Set(list)]` is the usual way to dedupe, and it silently yields a
    // one-element array holding the Set.
    pattern: /\.\.\.\s*new\s+(?:Map|Set)\b/,
    label: "spread of a freshly built Map or Set",
    remedy: "collect with forEach, or Array.from(...)",
  },
];

/** Scanned against built bundles by `verify:web` and `verify:wechat`. */
export const bundleHazardPatterns = [
  {
    pattern: /Math\.pow\(\s*\d+n\s*,\s*BigInt\(/,
    reason: "Cocos-transpiled BigInt exponentiation",
  },
  {
    pattern:
      /\[\]\.concat\((?!Object\.)[A-Za-z_$][A-Za-z0-9_$.]*\.(?:entries|keys|values)\(\)/,
    reason: "Cocos-transpiled spread of an iterator (use Map/Set forEach)",
  },
];

/**
 * Reports every source hazard with a line number, because the fix is always
 * local to one expression and a file-level verdict would make the reader search
 * for it.
 */
export function findSourceHazards(source, relativePath) {
  const found = [];
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const hazard of sourceHazardPatterns) {
      if (!hazard.pattern.test(line)) continue;
      found.push({
        file: relativePath,
        line: index + 1,
        label: hazard.label,
        remedy: hazard.remedy,
        text: line.trim(),
      });
    }
  }
  return found;
}

/** Formats one hazard as a single actionable line. */
export function formatSourceHazard(hazard) {
  return `${hazard.file}:${hazard.line} ${hazard.label} — ${hazard.remedy}\n    ${hazard.text}`;
}
