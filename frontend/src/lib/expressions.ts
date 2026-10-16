// Column names an expression uses: `backticked` or bare identifiers, matching
// the backend parser. The lookbehind skips exponents like the e5 in 1e5.
export function expressionRefs(expression: string): Set<string> {
  const refs = new Set<string>();
  const rest = expression.replace(/`([^`]+)`/g, (_, name: string) => {
    refs.add(name);
    return " ";
  });
  for (const [ref] of rest.matchAll(/(?<![\w.])[A-Za-z_]\w*/g)) {
    if (ref !== "abs" && ref !== "sqrt") refs.add(ref);
  }
  return refs;
}
