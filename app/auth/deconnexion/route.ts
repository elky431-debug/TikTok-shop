import { relativeRedirect } from '@/lib/http/redirect';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { LOCAL_SESSION_COOKIE } from '@/lib/auth/constants';
import { isLocalMode } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (isLocalMode()) {
    cookies().delete(LOCAL_SESSION_COOKIE);
  } else {
    await createSupabaseServerClient().auth.signOut();
  }
  return relativeRedirect('/');
}
