import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

export const maxDuration = 300;

/** Re-tag removed from product — initial import assigns speakers; refine in studio. */
export async function POST() {
  const { user, error } = await requireUser();
  if (!user) return error;

  return NextResponse.json(
    {
      error:
        "Re-tag is disabled. Speaker assignment runs once at import — use Speaker studio, Review, and AI review to refine.",
    },
    { status: 410 }
  );
}
