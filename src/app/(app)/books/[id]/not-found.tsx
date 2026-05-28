import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function BookNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-serif text-h1">Book not found</h1>
      <p className="mt-3 text-body-sm text-slate">
        This manuscript may have been removed or the link is out of date. Return
        to the dashboard to see your current books.
      </p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">Back to books</Link>
      </Button>
    </div>
  );
}
