import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;

  const agentId = '89b30336-e318-00ba-89d5-392b23085f7b';
  const dreamNetUrl = `https://agents-api.doodles.app/${agentId}/user/message`;

  const appId = process.env.DREAMNET_APP_ID;
  const appSecret = process.env.DREAMNET_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { message: 'DREAMNET_APP_ID or DREAMNET_APP_SECRET is not set in the environment variables.' },
      { status: 500 }
    );
  }

  const requestBody = JSON.stringify({
    text: message,
    user: 'user',
  });

  try {
    const response = await fetch(dreamNetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mini-app-id': appId,
        'x-mini-app-secret': appSecret,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ message: `DreamNet API failed: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    if (error instanceof Error) {
        return NextResponse.json({ message: `An error occurred: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ message: 'An unknown error occurred' }, { status: 500 });
  }
}