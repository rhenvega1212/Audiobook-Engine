import { NewBookForm } from "./new-book-form";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export default async function NewBookPage() {
  const supabase = await createClient();
  const [{ data: penNames }, { data: series }] = await Promise.all([
    supabase.from("pen_names").select("*").order("name"),
    supabase.from("series").select("*, pen_names(name)").order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="New book"
        description="Upload a manuscript to detect characters and begin casting."
      />
      <NewBookForm
        penNames={penNames ?? []}
        series={series ?? []}
      />
    </>
  );
}
