'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">Echoes of Creation</h1>
        <p className="text-xl mb-8">An interactive story with a character that remembers.</p>
        <Link href="/chat" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full transition duration-300 ease-in-out transform hover:scale-105">
          Start Your Journey
        </Link>
      </div>
    </div>
  );
}
