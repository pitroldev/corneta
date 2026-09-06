/** Static dependency graph only. Dynamic imports are feature costs, not boot costs. */
export function entryFiles(manifest, entry) {
  const visited = new Set();
  const files = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing build manifest chunk: ${key}`);
    files.add(chunk.file);
    for (const file of [...(chunk.css ?? []), ...(chunk.assets ?? [])])
      files.add(file);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit(entry);
  return [...files];
}
