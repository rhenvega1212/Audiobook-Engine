import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { BookStatusBadge } from "@/lib/books/status-badge";
import { displayBookTitle } from "@/lib/books/display-title";
import type { Book } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("*, series(id, name, pen_names(name))")
    .order("updated_at", { ascending: false });

  const list = (books ?? []) as Book[];

  return (
    <>
      <PageHeader
        title="Books"
        description="Shared team workspace — everyone sees the same projects. Edits save for the whole team; refresh to pick up changes."
      >
        <Button asChild>
          <Link href="/books/new">+ New Book</Link>
        </Button>
      </PageHeader>

      {booksError && (
        <Card className="mb-4 border-dark-red/30 bg-dark-red/5">
          <CardContent className="py-4 text-body-sm text-dark-red">
            Could not load books: {booksError.message}. If Supabase was recently
            restored, run pending migrations in the SQL editor (including{" "}
            <code className="text-xs">20250617000001_team_shared_access_rls.sql</code>
            ).
          </CardContent>
        </Card>
      )}

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-serif text-h2 text-ink">0 books yet</p>
            <p className="mt-2 max-w-sm text-body-sm text-slate">
              {booksError
                ? "Fix the database connection above, then refresh."
                : "Pour yourself a glass — your first book is just an upload away. Anyone you add in Team access will see it here too."}
            </p>
            <Button asChild className="mt-6">
              <Link href="/books/new">+ New Book</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <Table scrollable>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[12rem]">Title</TableHead>
                  <TableHead className="min-w-[10rem]">Series</TableHead>
                  <TableHead className="w-[8rem]">Status</TableHead>
                  <TableHead className="w-[7rem]">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((book) => (
                  <TableRow key={book.id}>
                    <TableCell>
                      <Link
                        href={`/books/${book.id}`}
                        className="font-medium text-teal hover:underline"
                      >
                        {displayBookTitle(book.title)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate">
                      {(book.series as { name?: string })?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <BookStatusBadge status={book.status} />
                    </TableCell>
                    <TableCell className="text-slate text-body-sm whitespace-nowrap">
                      {new Date(book.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
