"use client";
import { useState, FormEvent } from "react";

interface ChatMessage {
  type: "user" | "bot";
  text: string;
  imageUrl?: string;
}

export default function Home() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const userMessage: ChatMessage = { type: "user", text: message };
    setChat((prevChat) => [...prevChat, userMessage]);
    setMessage("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Network response was not ok");
      }

      const botMessage: ChatMessage = { type: "bot", text: data.text, imageUrl: data.imageUrl };
      setChat((prevChat) => [...prevChat, botMessage]);
    } catch (error) {
      console.error("There was a problem with the fetch operation:", error);
      const text = error instanceof Error ? error.message : "Sorry, something went wrong.";
      const errorMessage: ChatMessage = {
        type: "bot",
        text,
      };
      setChat((prevChat) => [...prevChat, errorMessage]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <div className="p-4 h-96 overflow-y-auto">
          {chat.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.type === "user" ? "justify-end" : "justify-start"
              } mb-4`}
            >
              <div
                className={`rounded-lg px-4 py-2 ${
                  msg.type === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}
              >
                <p>{msg.text}</p>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Generated Vision" className="mt-2 rounded-lg" />
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-gray-200 dark:border-gray-700"
        >
          <div className="flex">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-grow px-4 py-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Type your message..."
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}