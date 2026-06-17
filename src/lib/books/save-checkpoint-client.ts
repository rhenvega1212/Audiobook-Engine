export async function saveBookCheckpoint(
  bookId: string,
  label: string
): Promise<{ id: string; label: string; line_count: number; created_at: string }> {
  const res = await fetch(`/api/books/${bookId}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: label.trim() || "Manual restore point" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Could not save");
  }
  const snap = (data as { snapshot?: { id: string; label: string; line_count: number; created_at: string } }).snapshot;
  if (!snap) throw new Error("Could not save restore point");
  return snap;
}
