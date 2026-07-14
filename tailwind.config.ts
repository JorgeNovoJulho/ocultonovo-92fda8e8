import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        xs: "480px",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
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
        publish: {
          DEFAULT: "hsl(var(--publish))",
          foreground: "hsl(var(--publish-foreground))",
          border: "hsl(var(--publish-border))",
          glow: "hsl(var(--publish-glow))",
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
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        "glow-pulse-gold": {
          "0%, 100%": { 
            boxShadow: "0 0 8px hsl(45 93% 47% / 0.4), 0 0 16px hsl(45 93% 47% / 0.2)" 
          },
          "50%": { 
            boxShadow: "0 0 16px hsl(45 93% 47% / 0.6), 0 0 32px hsl(45 93% 47% / 0.4)" 
          },
        },
        "glow-pulse-pink": {
          "0%, 100%": { 
            boxShadow: "0 0 8px hsl(330 100% 50% / 0.4), 0 0 16px hsl(330 100% 50% / 0.2)" 
          },
          "50%": { 
            boxShadow: "0 0 16px hsl(330 100% 50% / 0.6), 0 0 32px hsl(330 100% 50% / 0.4)" 
          },
        },
        "glow-pulse-blue": {
          "0%, 100%": { 
            boxShadow: "0 0 8px hsl(210 100% 55% / 0.5), 0 0 16px hsl(200 100% 60% / 0.3)" 
          },
          "50%": { 
            boxShadow: "0 0 20px hsl(210 100% 55% / 0.7), 0 0 40px hsl(200 100% 60% / 0.5)" 
          },
        },
        "flame-pulse": {
          "0%, 100%": { 
            boxShadow: "0 0 12px hsl(25 95% 53% / 0.6), 0 0 24px hsl(25 95% 53% / 0.3)",
            transform: "scale(1)"
          },
          "50%": { 
            boxShadow: "0 0 24px hsl(25 95% 53% / 0.8), 0 0 48px hsl(25 95% 53% / 0.5)",
            transform: "scale(1.05)"
          },
        },
        "flame-pulse-fast": {
          "0%, 100%": { 
            boxShadow: "0 0 16px hsl(25 95% 53% / 0.7), 0 0 32px hsl(25 95% 53% / 0.4)",
            transform: "scale(1)"
          },
          "50%": { 
            boxShadow: "0 0 32px hsl(25 95% 53% / 0.9), 0 0 64px hsl(25 95% 53% / 0.6)",
            transform: "scale(1.08)"
          },
        },
        "gradient-x": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "shake": "shake 0.5s ease-in-out",
        "glow-pulse-gold": "glow-pulse-gold 2s ease-in-out infinite",
        "glow-pulse-pink": "glow-pulse-pink 2s ease-in-out infinite",
        "glow-pulse-blue": "glow-pulse-blue 2s ease-in-out infinite",
        "flame-pulse": "flame-pulse 2s ease-in-out infinite",
        "flame-pulse-fast": "flame-pulse-fast 0.8s ease-in-out infinite",
        "gradient-x": "gradient-x 3s ease infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
