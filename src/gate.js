export function features(results, query) {
  const a = results[0] || { score: 0, coverage: 0 },
    b = results[1] || { score: 0 };
  return {
    exactAlias: Boolean(a.exactAlias),
    top1: a.score,
    margin: a.score - b.score,
    length: [...query].length,
    coverage: a.coverage || 0,
  };
}
export function needsVector(f, gate) {
  if (!gate) throw new Error("Gate is not frozen");
  return (
    !f.exactAlias &&
    (f.top1 < gate.minTop1 ||
      f.margin < gate.minMargin ||
      f.coverage < gate.minCoverage ||
      f.length < gate.minLength)
  );
}
export function candidates() {
  const out = [];
  for (const minTop1 of [0, 0.1, 0.2, 0.3, 0.4, 0.5])
    for (const minMargin of [0, 0.02, 0.05, 0.1, 0.15])
      for (const minCoverage of [0, 0.25, 0.5, 0.75])
        for (const minLength of [0, 3, 5])
          out.push({ minTop1, minMargin, minCoverage, minLength });
  return out;
}
