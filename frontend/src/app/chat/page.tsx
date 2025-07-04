/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { MicrophoneIcon } from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createProgrammableNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, percentAmount, some } from '@metaplex-foundation/umi';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import bs58 from 'bs58';

interface Agent {
  id: string;
  name: string;
  avatar: string;
  bio: string;
}

interface ChatMessage {
  type: 'user' | 'bot';
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  mementoId?: string;
  sceneType?: string;
}

export default function Chat() {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState<boolean>(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [loadingMemories, setLoadingMemories] = useState<boolean>(false);
  const [memoriesError, setMemoriesError] = useState<string | null>(null);
  const [isMemoriesPanelOpen, setIsMemoriesPanelOpen] = useState<boolean>(false);
  const [mintingState, setMintingState] = useState<{ [key: string]: string }>({});
  const [mintSignatures, setMintSignatures] = useState<{ [key: string]: string }>({});

  const { connection } = useConnection();
  const wallet = useWallet();

  useEffect(() => {
    if (isMemoriesPanelOpen && selectedAgentId && !loadingMemories && memories.length === 0) {
      fetchMemories();
    }
  }, [isMemoriesPanelOpen, selectedAgentId]);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch('/api/agents');
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.message || 'Failed to fetch agents');
        }
        const data = await response.json();
        setAgents(data.agents);
        if (data.agents.length > 0) {
          setSelectedAgentId(data.agents[0].id);
        }
      } catch (err) {
        if (err instanceof Error) {
          setAgentsError(err.message);
        } else {
          setAgentsError('An unknown error occurred while fetching agents.');
        }
      } finally {
        setLoadingAgents(false);
      }
    };
    fetchAgents();
  }, []);

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
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, agentId: selectedAgentId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Network response was not ok');
      }

      const botMessage: ChatMessage = {
        type: 'bot',
        text: data.text,
        imageUrl: data.imageUrl,
        audioUrl: data.audioUrl,
        mementoId: data.mementoId,
        sceneType: data.sceneType,
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
      setIsLoading(false);
    }
  };

  const handleMint = async (mementoId: string, imageUrl: string, sceneType: string) => {
    if (!wallet.connected) {
      alert("Please connect your wallet to mint.");
      return;
    }

    setMintingState(prev => ({ ...prev, [mementoId]: 'minting' }));

    try {
      const prepareResponse = await fetch('https://echoes-of-creation-inky.vercel.app/prepare-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mementoId, imageUrl, sceneType }),
      });

      if (!prepareResponse.ok) {
        const errorBody = await prepareResponse.text();
        throw new Error(`Failed to prepare mint data: ${prepareResponse.statusText} - ${errorBody}`);
      }

      const { metadataUri } = await prepareResponse.json();

      const umi = createUmi(connection.rpcEndpoint)
        .use(mplTokenMetadata())
        .use(walletAdapterIdentity(wallet));

      const nftSigner = generateSigner(umi);

      const tx = await createProgrammableNft(umi, {
        mint: nftSigner,
        sellerFeeBasisPoints: percentAmount(5.5),
        name: "Echoes of Creation Memento",
        uri: metadataUri,
        ruleSet: null,
      }).sendAndConfirm(umi);

      const signature = bs58.encode(tx.signature);
      setMintSignatures(prev => ({ ...prev, [mementoId]: signature }));
      setMintingState(prev => ({ ...prev, [mementoId]: 'minted' }));

    } catch (error) {
      console.error("Minting failed:", error);
      setMintingState(prev => ({ ...prev, [mementoId]: 'error' }));
    }
  };

  const fetchMemories = async () => {
    if (!selectedAgentId) {
      setMemoriesError('Please select an agent first.');
      return;
    }
    setLoadingMemories(true);
    setMemoriesError(null);
    try {
      const response = await fetch(`/api/memories?agentId=${selectedAgentId}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to fetch memories');
      }
      const data = await response.json();
      setMemories(data.memories || []);
      alert('Memories fetched successfully! Check console for details.');
      console.log('Fetched Memories:', data.memories);
    } catch (err) {
      if (err instanceof Error) {
        setMemoriesError(err.message);
      } else {
        setMemoriesError('An unknown error occurred while fetching memories.');
      }
    } finally {
      setLoadingMemories(false);
    }
  };

  const clearMemories = async () => {
    if (!selectedAgentId) {
      setMemoriesError('Please select an agent first.');
      return;
    }
    if (!confirm('Are you sure you want to clear all memories for this agent?')) {
      return;
    }
    setLoadingMemories(true);
    setMemoriesError(null);
    try {
      const response = await fetch(`/api/clear-memories?agentId=${selectedAgentId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to clear memories');
      }
      setMemories([]);
      setChat([]);
      alert('Memories cleared successfully!');
    } catch (err) {
      if (err instanceof Error) {
        setMemoriesError(err.message);
      } else {
        setMemoriesError('An unknown error occurred while clearing memories.');
      }
    } finally {
      setLoadingMemories(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 to-black text-white font-sans">
      <div className="p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <h1 className="text-xl font-bold">Echoes of Creation</h1>
        <div className="flex items-center space-x-4">
          {agentsError && <p className="text-red-400">Error: {agentsError}</p>}
          {memoriesError && <p className="text-red-400">Error: {memoriesError}</p>}
          {loadingAgents ? (
            <p className="text-gray-400">Loading agents...</p>
          ) : (
            <div className="flex items-center space-x-2">
              <label htmlFor="agent-select" className="text-gray-300">Select Agent:</label>
              <select
                id="agent-select"
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="bg-gray-700 text-white rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <WalletMultiButton />
        </div>
      </div>
      <div className="flex flex-row flex-1 overflow-hidden min-h-0">
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar min-h-0" ref={chatContainerRef}>
          {chat.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-start gap-4 mb-8 ${msg.type === 'user' ? 'justify-end' : ''
                }`}>
              {msg.type === 'bot' && (
                <img src={agents.find(agent => agent.id === selectedAgentId)?.avatar} alt="Agent Avatar" className="w-12 h-12 rounded-full border-2 border-blue-500 shadow-lg flex-shrink-0" />
              )}
              <div
                className={`rounded-xl px-5 py-3 shadow-xl max-w-lg relative ${msg.type === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-800 text-gray-200 rounded-bl-none'
                  }`}>
                <div className="text-base whitespace-pre-wrap leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                </div>
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
                {msg.mementoId && msg.imageUrl && (
                  <div className="mt-4">
                    {mintingState[msg.mementoId] === 'minted' ? (
                      <a href={`https://explorer.solana.com/tx/${mintSignatures[msg.mementoId]}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-green-400">
                        Mint Successful! View on Explorer
                      </a>
                    ) : (
                      <button
                        onClick={() => handleMint(msg.mementoId!, msg.imageUrl!, msg.sceneType!)}
                        disabled={mintingState[msg.mementoId] === 'minting'}
                        className="px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-200"
                      >
                        {mintingState[msg.mementoId] === 'minting' ? 'Minting...' : 'Mint Memento'}
                      </button>
                    )}
                    {mintingState[msg.mementoId] === 'error' && <p className="text-red-400 mt-2">Minting failed. Please try again.</p>}
                  </div>
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
        {isMemoriesPanelOpen && (
          <div className="w-1/4 bg-gray-800 p-6 border-l border-gray-700 overflow-y-auto custom-scrollbar">
            <h2 className="text-xl font-bold mb-4">Memories</h2>
            {loadingMemories ? (
              <p>Loading memories...</p>
            ) : memoriesError ? (
              <p className="text-red-400">Error: {memoriesError}</p>
            ) : memories.length === 0 ? (
              <p>No memories found for this agent.</p>
            ) : (
              <ul>
                {memories.map((memory, idx) => (
                  <li key={idx} className="mb-2 p-2 bg-gray-700 rounded-md">
                    <p className="text-sm"><strong>Role:</strong> {memory.role}</p>
                    <p className="text-sm"><strong>Content:</strong> {memory.content}</p>
                    <p className="text-xs text-gray-400">{new Date(memory.timestamp).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
''