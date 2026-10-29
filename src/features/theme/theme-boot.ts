/**
 * Theme chosen in the toggle, applied before the first paint. The server cannot read localStorage, so every
 * `ThemeScope` is server-rendered as "system"; without this a light choice on a dark-system machine shows dark
 * on every full page load (new tab, reload, link) until hydration. The inline script copies an explicit
 * "light" / "dark" choice onto <html data-ops-theme>, and ops.css lets that win over the system setting for
 * scopes still in "system" mode. `ThemeScope` keeps the attribute in sync after hydration.
 * Plain module (not "use client") so the root layout, a Server Component, can inline the script.
 */
export const THEME_STORAGE_KEY = "fire3d-ops-theme";
export const THEME_ROOT_ATTRIBUTE = "data-ops-theme";

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute(${JSON.stringify(THEME_ROOT_ATTRIBUTE)},t)}catch(e){}})()`;
