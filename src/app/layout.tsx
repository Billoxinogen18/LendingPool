import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { WalletProvider } from "@/contexts/WalletContext";
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lending Pool",
  description: "A decentralized lending and borrowing platform.",
  other: {
    "Cache-Control": "no-store, must-revalidate",
    "Pragma": "no-cache"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider>
          <Toaster
            position="top-center"
            reverseOrder={false}
            toastOptions={{
              className: '',
              style: {
                background: '#1f2937',
                color: '#fff',
                border: '1px solid #4b5563',
              },
            }}
          />
          <Navbar />
          <main className="pt-20">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
