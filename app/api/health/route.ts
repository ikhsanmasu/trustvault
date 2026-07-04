import { NextResponse } from "next/server";
import { getHealthStatus } from "@/lib/monitoring";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getHealthStatus());
}
