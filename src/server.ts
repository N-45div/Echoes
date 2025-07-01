import express, { Request, Response } from "express";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
const PORT = process.env.SERVER_PORT || 4000;

/**
 * Webhook endpoint that handles incoming requests, verifies signatures, and returns appropriate responses.
 * @param req - Express request object containing headers and body
 * @param res - Express response object for sending back responses
 * @returns JSON response with transformed data and appropriate text based on event type
 */
app.post("/", (req: Request, res: Response) => {
  const sigHeader = req.headers["x-signature"];
  const data = req.body;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).send("Webhook secret is not set");
  }

  const isValid = verifySignature(data, sigHeader, webhookSecret);
  if (!isValid) return res.status(403).send("Invalid signature");

  return res.status(200).json({
    ...data,
    text:
      data.eventType == "request"
        ? "Hello, how are you?"
        : "I am doing well, thank you for asking.", // This is an example response
    saveModified: data.eventType == "request" ? true : false, // Pass `saveModified` as `true` or `false` depending on whether you want to save the modified text to the chat history.
  });
});

/**
 * Verifies the signature of the incoming webhook request using HMAC SHA-256.
 * @param rawBody - The raw body of the request to verify
 * @param signature - The signature from the request headers to verify against
 * @param secret - The webhook secret used for signature verification
 * @returns boolean indicating whether the signature is valid
 */
function verifySignature(
  rawBody: string,
  signature: any,
  secret: string
): boolean {
  try {
    const cleanSignature = signature?.trim();
    if (!cleanSignature) return false;

    const hmac = crypto.createHmac("sha256", secret);
    const rawBodyStr =
      typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    hmac.update(rawBodyStr);
    const expected = hmac.digest("base64");

    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature),
      Buffer.from(expected)
    );
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Starts the Express server and handles any startup errors
 */
app
  .listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  })
  .on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use`);
    } else {
      console.error("❌ Server failed to start:", error.message);
    }
    process.exit(1);
  });
