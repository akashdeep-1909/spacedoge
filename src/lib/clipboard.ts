// navigator.clipboard.writeText can throw — denied permission, insecure
// context, or an older browser without the API at all. Falls back to
// the legacy execCommand path, and reports failure instead of leaving
// the caller silently hanging (a bare `await` on a rejected clipboard
// promise otherwise skips every line after it with no feedback).
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}
