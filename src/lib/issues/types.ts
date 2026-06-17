export type IssueReportStatus = "open" | "resolved";

export type IssueReportRow = {
  id: string;
  status: IssueReportStatus;
  description: string;
  page_url: string;
  page_label: string | null;
  context_json: Record<string, unknown>;
  screenshot_path: string | null;
  reported_by: string;
  reporter_email: string;
  created_at: string;
  resolved_at: string | null;
};

export type IssueReportContext = {
  pathname: string;
  search: string;
  page_title: string;
  viewport: string;
  user_agent: string;
  captured_at: string;
  book_id?: string;
  line_id?: string;
};

export function pageLabelFromPath(pathname: string): string {
  if (pathname.startsWith("/books/") && pathname.includes("/manuscript")) {
    return "Speaker studio";
  }
  if (pathname.startsWith("/books/") && pathname.includes("/cleanup")) {
    return "Manuscript cleanup";
  }
  if (pathname.startsWith("/books/") && pathname.includes("/review")) {
    return "Review";
  }
  if (pathname.startsWith("/books/") && pathname.includes("/listen")) {
    return "Listen mode";
  }
  if (pathname.startsWith("/books/")) {
    return "Book detail";
  }
  if (pathname === "/dashboard") return "Books dashboard";
  if (pathname.startsWith("/characters")) return "Characters";
  if (pathname.startsWith("/voices")) return "Voices";
  if (pathname.startsWith("/settings")) return "Settings";
  return pathname || "App";
}

export function buildIssueContext(): IssueReportContext {
  if (typeof window === "undefined") {
    return {
      pathname: "",
      search: "",
      page_title: "",
      viewport: "",
      user_agent: "",
      captured_at: new Date().toISOString(),
    };
  }

  const params = new URLSearchParams(window.location.search);
  const ctx: IssueReportContext = {
    pathname: window.location.pathname,
    search: window.location.search,
    page_title: document.title,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    user_agent: navigator.userAgent,
    captured_at: new Date().toISOString(),
  };

  const bookMatch = window.location.pathname.match(
    /^\/books\/([0-9a-f-]{36})/i
  );
  if (bookMatch?.[1]) ctx.book_id = bookMatch[1];
  const lineId = params.get("line");
  if (lineId) ctx.line_id = lineId;

  return ctx;
}
