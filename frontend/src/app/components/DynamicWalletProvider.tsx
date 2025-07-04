'use client';

import dynamic from 'next/dynamic';
import { FC, ReactNode } from 'react';

const WalletContextProvider = dynamic(
  () => import('../contexts/WalletContextProvider').then((mod) => mod.default),
  { ssr: false }
);

const DynamicWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return <WalletContextProvider>{children}</WalletContextProvider>;
};

export default DynamicWalletProvider;
