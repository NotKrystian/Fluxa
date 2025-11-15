import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Fluxa - Multi-Chain Liquidity Routing',
  description: 'Global liquidity routing layer powered by Arc',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="border-b border-gray-200 dark:border-gray-800">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <a href="/" className="flex items-center space-x-2">
                <div className="w-8 h-8 gradient-arc rounded-lg"></div>
                <span className="text-xl font-bold">Fluxa</span>
              </a>
              <div className="flex items-center space-x-6">
                <a href="/vaults" className="hover:text-arc-blue transition-colors">Vaults</a>
                <a href="/deploy" className="hover:text-arc-green transition-colors">Deploy</a>
                <a href="/swap" className="hover:text-arc-blue transition-colors">Swap</a>
                <a href="/highvalue" className="hover:text-arc-purple transition-colors font-semibold">Showcase</a>
              </div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
          <div className="container mx-auto px-4 py-8 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Fluxa Protocol - Built on Arc • Powered by Circle</p>
          </div>
        </footer>
      </body>
    </html>
  )
}

