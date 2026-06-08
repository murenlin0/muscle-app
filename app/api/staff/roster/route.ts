import { NextResponse } from 'next/server';
import { listActiveStaffForRoster } from '@/lib/staff-auth-server';

export async function GET() {
  try {
    const staff = await listActiveStaffForRoster();
    return NextResponse.json({ staff });
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入師傅';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
