/** Auf eine Leerlaufphase des Browsers warten (höchstens 200 ms), damit lange Vorbereitungen das Bild nicht stocken lassen */
export const idle = () =>
  new Promise<void>((res) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => res(), { timeout: 200 });
    else setTimeout(res, 16);
  });
