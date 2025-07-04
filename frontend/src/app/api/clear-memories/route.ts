import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId');
  const userId = req.cookies.get('userId')?.value;

  if (!agentId || !userId) {
    return NextResponse.json({ message: 'Missing agentId or userId' }, { status: 400 });
  }

  const dreamNetClearMemoriesApiUrl = `https://agents-api.doodles.app/${agentId}/memories`;
  const dreamNetAppId = process.env.DREAMNET_APP_ID;
  const dreamNetAppSecret = process.env.DREAMNET_APP_SECRET;

  if (!dreamNetAppId || !dreamNetAppSecret) {
    return NextResponse.json({ message: 'DREAMNET_APP_ID or DREAMNET_APP_SECRET is not set in the environment variables.' }, { status: 500 });
  }

  try {
    const response = await fetch(dreamNetClearMemoriesApiUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-mini-app-id': dreamNetAppId,
        'x-mini-app-secret': dreamNetAppSecret,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ message: `Failed to clear memories: ${errorText}` }, { status: response.status });
    }

    return NextResponse.json({ message: 'Memories cleared successfully' });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ message: `An error occurred: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ message: 'An unknown error occurred' }, { status: 500 });
  }
}
