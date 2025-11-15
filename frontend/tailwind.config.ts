import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'arc-blue': '#0EA5E9',
        'arc-purple': '#8B5CF6',
        'arc-green': '#10B981',
      },
    },
  },
  plugins: [],
}
export default config

