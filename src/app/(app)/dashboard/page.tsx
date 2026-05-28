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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: books } = await supabase
    .from("books")
    .select("*, series(id, name, pen_names(name))")
    .order("updated_at", { ascending: false });

  const list = (books ?? []) as Book[];

  return (
    <>
      <PageHeader
        title="Books"
        description={
          user?.email ? `Welcome back, ${user.email.split("@")[0]}` : undefined
        }
      >
        <Button asChild>
          <Link href="/books/new">+ New Book</Link>
        </Button>
      </PageHeader>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-serif text-h2 text-ink">0 books yet</p>
            <p className="mt-2 max-w-sm text-body-sm text-slate">
              Pour yourself a glass — your first book is just an upload away.
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
