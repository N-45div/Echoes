'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { MicrophoneIcon } from '@heroicons/react/24/solid'; // Import the mic icon from Heroicons
import { motion } from 'framer-motion'; // Import motion from framer-motion
import ReactMarkdown from 'react-markdown'; // Import ReactMarkdown

interface ChatMessage {
  type: 'user' | 'bot';
  text: string;
  imageUrl?: string;
  audioUrl?: string;
}

export default function Chat() {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // New loading state

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chat]);

  const playAudio = (url: string) => {
    if (audioRef.current) {
      if (playingAudio === url) {
        audioRef.current.pause();
        setPlayingAudio(null);
      } else {
        audioRef.current.src = url;
        audioRef.current.play();
        setPlayingAudio(url);
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const userMessage: ChatMessage = { type: 'user', text: message };
    setChat((prevChat) => [...prevChat, userMessage]);
    setMessage('');
    setIsLoading(true); // Set loading to true

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Network response was not ok');
      }

      const responseText = data.text;
      const imageUrl = data.imageUrl;

      // The text from the webhook is already the final, desired text.
      const finalDisplayText = responseText;

      const audioUrl = `https://text.pollinations.ai/${encodeURIComponent(finalDisplayText)}?model=openai-audio&voice=nova`;

      const botMessage: ChatMessage = { 
        type: 'bot', 
        text: finalDisplayText,
        imageUrl, 
        audioUrl
      };
      setChat((prevChat) => [...prevChat, botMessage]);

    } catch (error) {
      console.error('There was a problem with the fetch operation:', error);
      const text = error instanceof Error ? error.message : 'Sorry, something went wrong.';
      const errorMessage: ChatMessage = {
        type: 'bot',
        text,
      };
      setChat((prevChat) => [...prevChat, errorMessage]);
    } finally {
      setIsLoading(false); // Set loading to false regardless of success or failure
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 to-black text-white font-sans">
      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar" ref={chatContainerRef}>
        {chat.map((msg, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex items-start gap-4 mb-8 ${
              msg.type === 'user' ? 'justify-end' : ''
            }`}>
            {msg.type === 'bot' && (
              <img src="/kyle.png" alt="Kyle" className="w-12 h-12 rounded-full border-2 border-blue-500 shadow-lg flex-shrink-0" />
            )}
            <div
              className={`rounded-xl px-5 py-3 shadow-xl max-w-lg relative ${
                msg.type === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-800 text-gray-200 rounded-bl-none'
              }`}>
              <p className="text-base whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              {msg.imageUrl && (
                <img src={msg.imageUrl} alt="Generated Vision" className="mt-4 rounded-lg shadow-md" />
              )}
              {msg.audioUrl && (
                <button
                  onClick={() => playAudio(msg.audioUrl!)}
                  className="mt-3 p-2 rounded-full bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all duration-200 flex items-center justify-center"
                >
                  <MicrophoneIcon className={`w-6 h-6 ${playingAudio === msg.audioUrl ? 'text-red-300' : 'text-white'}`} />
                </button>
              )}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-4 mb-8">
            <img src="/kyle.png" alt="Kyle" className="w-12 h-12 rounded-full border-2 border-blue-500 shadow-lg flex-shrink-0" />
            <div className="rounded-xl px-5 py-3 shadow-xl max-w-lg relative bg-gray-800 text-gray-200 rounded-bl-none">
              <p className="text-base whitespace-pre-wrap leading-relaxed">Thinking... response oncoming</p>
            </div>
          </div>
        )}
        <audio ref={audioRef} onEnded={() => setPlayingAudio(null)} />
      </div>
      <form onSubmit={handleSubmit} className="p-6 bg-gray-800 border-t border-gray-700 shadow-2xl">
        <div className="flex items-center space-x-4">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-grow px-6 py-3 bg-gray-700 border border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400 text-lg"
            placeholder="Send a message to Kyle..."
          />
          <button
            type="submit"
            className="px-8 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-lg font-semibold"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}