import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Appbar } from "./components/Appbar";
import { AuthProvider } from "./providers/AuthProvider";
import { ToastProvider } from "./providers/ToastProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Backpack Exchange",
  description:
    "Trade your favorite cryptocurrencies with low fees and deep liquidity",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-bp-bg-primary text-bp-text-primary antialiased`}
      >
        <AuthProvider>
          <ToastProvider />
          <div className="flex flex-col h-screen overflow-hidden">
            <Appbar />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}