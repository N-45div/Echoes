import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const dreamNetAgentsApiUrl = 'https://agents-api.doodles.app/agents';
    const response = await fetch(dreamNetAgentsApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ message: `Failed to fetch agents: ${errorText}` }, { status: response.status });
    }

    const agentsData = await response.json();
    return NextResponse.json(agentsData);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ message: `An error occurred: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ message: 'An unknown error occurred' }, { status: 500 });
  }
}
