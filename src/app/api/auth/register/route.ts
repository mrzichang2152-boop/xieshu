import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/users-db';
import { signJWT } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    // Simple registration without validation as requested
    try {
      const user = await createUser(username, password);
      
      const token = await signJWT({ sub: user.id, username: user.username });
      
      // Set cookie - Auto login after register
      const cookieStore = await cookies();
      cookieStore.set('token', token, {
        httpOnly: true,
        // secure: process.env.NODE_ENV === 'production', // Disable secure cookie for HTTP deployment
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });

      return NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
    } catch (e: any) {
      if (e.message === 'Username already exists') {
        return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
      }
      throw e;
    }
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
