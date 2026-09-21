import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import "./theme.css";

// Переключатель темы, как в калькуляторах: по умолчанию всегда тёмное «матовое стекло»,
// выбор хранится в localStorage["latuning-theme"] и ставится атрибутом data-theme на <html> (см. public/theme-init.js).
export type Theme = "dark" | "light";
const KEY = "latuning-theme";
const listeners = new Set<(theme: Theme) => void>();

export function currentTheme(): Theme { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }

function apply(theme: Theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f6f4" : "#0b0f13");
  try { localStorage.setItem(KEY, theme); } catch { /* приватный режим — тема просто не запомнится */ }
  listeners.forEach(listener => listener(theme));
}

export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => { listeners.add(setTheme); return () => { listeners.delete(setTheme); }; }, []);
  return theme;
}

export function ThemeToggle() {
  const theme = useTheme(), next = theme === "dark" ? "light" : "dark";
  const label = theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
  return <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => apply(next)}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button>;
}
