import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message: userMessageText, agentId } = body;
  const dreamNetApiUrl = `https://agents-api.doodles.app/${agentId}/user/message`;
  const webhookUrl = 'https://echoes-of-creation-inky.vercel.app/webhook';
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const dreamNetAppId = process.env.DREAMNET_APP_ID;
  const dreamNetAppSecret = process.env.DREAMNET_APP_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ message: 'WEBHOOK_SECRET is not set in the environment variables.' }, { status: 500 });
  }
  if (!dreamNetAppId || !dreamNetAppSecret) {
    return NextResponse.json({ message: 'DREAMNET_APP_ID or DREAMNET_APP_SECRET is not set in the environment variables.' }, { status: 500 });
  }

  try {
    // Generate consistent roomId and userId for the session
    // In a real app, you'd use session IDs or user authentication
    const sessionRoomId = req.cookies.get('roomId')?.value || 'room-' + Math.random().toString(36).substring(2, 15);
    const sessionUserId = req.cookies.get('userId')?.value || 'user-' + Math.random().toString(36).substring(2, 15);

    // 1. Call DreamNet API
    const dreamNetRequestBody = JSON.stringify({
      text: userMessageText,
      user: sessionUserId, // Use sessionUserId for unique conversation history with DreamNet
    });

    const dreamNetResponse = await fetch(dreamNetApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mini-app-id': dreamNetAppId,
        'x-mini-app-secret': dreamNetAppSecret,
      },
      body: dreamNetRequestBody,
    });

    if (!dreamNetResponse.ok) {
      const errorText = await dreamNetResponse.text();
      return NextResponse.json({ message: `DreamNet API failed: ${errorText}` }, { status: dreamNetResponse.status });
    }

    const dreamNetData = await dreamNetResponse.json();
    console.log('Response from DreamNet API:', dreamNetData);

    // Extract text from DreamNet response (it's an array)
    const dreamNetAgentText = Array.isArray(dreamNetData) && dreamNetData.length > 0 
      ? dreamNetData[0].text 
      : 'DreamNet returned no text.';

    // 2. Forward DreamNet response to your webhook for post-processing
    const webhookPayload = {
      roomId: sessionRoomId,
      userId: sessionUserId,
      agentId: agentId,
      text: dreamNetAgentText, // Use the extracted text from DreamNet
      eventType: 'response', // This is DreamNet's response being processed
      originalUserMessage: userMessageText, // Pass original user message for webhook context
    };

    const webhookPayloadString = JSON.stringify(webhookPayload);

    const signature = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookPayloadString)
      .digest('base64');

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
      },
      body: webhookPayloadString,
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('Raw error from webhook:', errorText); // Log raw error
      return NextResponse.json({ message: `Webhook post-processing failed: ${errorText}` }, { status: webhookResponse.status });
    }

    const rawWebhookResponseBody = await webhookResponse.text(); // Read raw body
    console.log('Raw response from webhook:', rawWebhookResponseBody); // Log raw body
    const finalResponseData = JSON.parse(rawWebhookResponseBody); // Parse raw body
    console.log('Final response from webhook:', finalResponseData);

    // 3. Return webhook's response to frontend
    const response = NextResponse.json(finalResponseData); // Create response with JSON body
    response.cookies.set('roomId', sessionRoomId); // Set cookies on the response
    response.cookies.set('userId', sessionUserId);
    return response;

  } catch (error) {
    if (error instanceof Error) {
        return NextResponse.json({ message: `An error occurred: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ message: 'An unknown error occurred' }, { status: 500 });
  }
}