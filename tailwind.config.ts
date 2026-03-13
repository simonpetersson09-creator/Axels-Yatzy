import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        game: {
          gold: "hsl(var(--game-gold))",
          "gold-light": "hsl(var(--game-gold-light))",
          "gold-dark": "hsl(var(--game-gold-dark))",
          surface: "hsl(var(--game-surface))",
          "surface-hover": "hsl(var(--game-surface-hover))",
          dice: "hsl(var(--game-dice))",
          "dice-dot": "hsl(var(--game-dice-dot))",
          "dice-locked": "hsl(var(--game-dice-locked))",
          success: "hsl(var(--game-success))",
          info: "hsl(var(--game-info))",
        },
        yatzy: {
          bg: "hsl(var(--yatzy-bg))",
          line: "hsl(var(--yatzy-line))",
          "line-strong": "hsl(var(--yatzy-line-strong))",
          text: "hsl(var(--yatzy-text))",
          header: "hsl(var(--yatzy-header))",
          highlight: "hsl(var(--yatzy-highlight))",
          "section-header": "hsl(var(--yatzy-section-header))",
          "sum-row": "hsl(var(--yatzy-sum-row))",
          player1: "hsl(var(--yatzy-player1))",
          player2: "hsl(var(--yatzy-player2))",
          player3: "hsl(var(--yatzy-player3))",
          player4: "hsl(var(--yatzy-player4))",
          "player1-soft": "hsl(var(--yatzy-player1-soft))",
          "player2-soft": "hsl(var(--yatzy-player2-soft))",
          "player3-soft": "hsl(var(--yatzy-player3-soft))",
          "player4-soft": "hsl(var(--yatzy-player4-soft))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "dice-roll": {
          "0%": { transform: "rotateX(0deg) rotateY(0deg)" },
          "25%": { transform: "rotateX(90deg) rotateY(90deg)" },
          "50%": { transform: "rotateX(180deg) rotateY(180deg)" },
          "75%": { transform: "rotateX(270deg) rotateY(90deg)" },
          "100%": { transform: "rotateX(360deg) rotateY(360deg)" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slide-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "pulse-gold": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(40 90% 55% / 0.4)" },
          "50%": { boxShadow: "0 0 0 8px hsl(40 90% 55% / 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "dice-roll": "dice-roll 0.6s ease-out",
        "bounce-in": "bounce-in 0.5s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "pulse-gold": "pulse-gold 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
