import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rf: {
          navy: "#172554",
          blue: "#2563EB",
          "blue-hover": "#1D4ED8",
          "blue-dark": "#1E40AF",
          bg: "#F3F6FC",
          surface: "#FFFFFF",
          "surface-alt": "#F8FAFC",
          "surface-muted": "#EEF2F6",
          text: "#172033",
          "text-secondary": "#64748B",
          "text-muted": "#94A3B8",
          success: "#16A34A",
          "success-light": "#DCFCE7",
          warning: "#F59E0B",
          "warning-light": "#FEF3C7",
          danger: "#DC2626",
          "danger-light": "#FEE2E2",
          border: "#E2E8F0",
          "border-dark": "#CBD5E1",
          highlight: "#F0F5FF",
        },
      },
      borderRadius: {
        "rf-sm": "10px",
        rf: "14px",
        "rf-md": "16px",
        "rf-lg": "18px",
        "rf-xl": "22px",
      },
      boxShadow: {
        // Skeuomorphic raised card
        "tactile-card":
          "0 1px 2px rgba(20, 33, 61, 0.04), 0 4px 12px rgba(20, 33, 61, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
        "tactile-card-hover":
          "0 2px 4px rgba(20, 33, 61, 0.05), 0 8px 24px rgba(20, 33, 61, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)",
        // Skeuomorphic primary button
        "tactile-btn":
          "0 1px 2px rgba(0, 0, 0, 0.12), 0 3px 6px rgba(37, 99, 235, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25), inset 0 -2px 0 rgba(0, 0, 0, 0.15)",
        "tactile-btn-pressed":
          "inset 0 2px 4px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.05)",
        // Skeuomorphic secondary / neutral button
        "tactile-btn-secondary":
          "0 1px 2px rgba(20, 33, 61, 0.06), 0 2px 4px rgba(20, 33, 61, 0.04), inset 0 1px 0 #ffffff, inset 0 -1px 0 rgba(20, 33, 61, 0.08)",
        "tactile-btn-secondary-pressed":
          "inset 0 2px 3px rgba(20, 33, 61, 0.12), 0 1px 1px rgba(255, 255, 255, 0.8)",
        // Inset surfaces for inputs
        "tactile-inset":
          "inset 0 2px 4px rgba(20, 33, 61, 0.06), inset 0 1px 2px rgba(20, 33, 61, 0.04)",
        "tactile-inset-focus":
          "inset 0 1px 2px rgba(37, 99, 235, 0.1), 0 0 0 3px rgba(37, 99, 235, 0.15)",
        // Floating map pins and modals
        "tactile-float":
          "0 8px 30px rgba(20, 33, 61, 0.12), 0 2px 6px rgba(20, 33, 61, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
        // Physical switch knob
        "switch-knob":
          "0 2px 5px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
      },
    },
  },
  plugins: [],
};

export default config;
