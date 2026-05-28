/** Strip workflow-test timestamp suffixes from stored titles for display. */
export function displayBookTitle(title: string): string {
  return title.replace(/\s+\d{10,13}$/, "").trim();
}
