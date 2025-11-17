import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#101010',
        surface: '#1b1b1b',
        accent: '#8ef3ff'
      }
    }
  },
  plugins: []
}

export default config
