/** Light: 6:00–17:59 · Dark: 18:00–5:59 */
export function getThemeByTime(date = new Date()) {
  const hour = date.getHours();
  return hour >= 6 && hour < 18 ? "light" : "dark";
}

export function resolveTheme(override) {
  if (override === "light" || override === "dark") return override;
  return getThemeByTime();
}

export const THEME_STORAGE_KEY = "mcqThemeOverride";
