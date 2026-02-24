import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const payload = await verifyJWT(token);
  if (!payload) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ 
    user: { 
      id: payload.sub, 
      username: payload.username 
    } 
  });
}
