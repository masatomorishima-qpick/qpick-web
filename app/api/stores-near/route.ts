import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng is required" }, { status: 400 });
  }

  const radius_m = 1500;
  const limit_n = 10;

  const { data, error } = await supabase.rpc("nearby_stores", {
    in_lat: lat,
    in_lng: lng,
    radius_m,
    limit_n,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stores: data ?? [] });
}
