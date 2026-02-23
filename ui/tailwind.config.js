import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        'border-subtle': 'var(--border-subtle)',
        'border-medium': 'var(--border-medium)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        success: {
          fill: 'var(--success-fill)',
          text: 'var(--success-text)',
          surface: 'var(--success-surface)',
        },
        warning: {
          fill: 'var(--warning-fill)',
          text: 'var(--warning-text)',
          surface: 'var(--warning-surface)',
        },
        critical: {
          fill: 'var(--critical-fill)',
          text: 'var(--critical-text)',
          surface: 'var(--critical-surface)',
        },
        info: {
          fill: 'var(--info-fill)',
          text: 'var(--info-text)',
          surface: 'var(--info-surface)',
        },
        'role-backup': 'var(--role-backup)',
        'bar-recordings': 'var(--bar-recordings)',
        'bar-other': 'var(--bar-other)',
        // shadcn compat
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
