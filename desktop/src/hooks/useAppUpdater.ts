import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";

/** Tauri auto-updater — check, download, and install. */
export function useAppUpdater() {
  const [updateStatus, setUpdateStatus] = useState("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

  // Auto-check silently on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const update = await check();
        if (update && mounted) {
          setHasUpdate(true);
          setUpdateStatus(`Update ${update.version} is available!`);
        }
      } catch (err) {
        console.error("Silent update check failed:", err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const checkForUpdates = async () => {
    try {
      setIsCheckingUpdate(true);
      setUpdateStatus("Looking for updates...");
      const update = await check();
      if (update) {
        setHasUpdate(true);
        setUpdateStatus(`Downloading update ${update.version}...`);
        let downloaded = 0;
        let contentLength = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') {
            contentLength = event.data.contentLength || 0;
            setUpdateStatus(`Downloading update ${update.version} (0%)...`);
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            const percent = contentLength ? Math.round((downloaded / contentLength) * 100) : 0;
            setUpdateStatus(`Downloading update ${update.version} (${percent}%)...`);
          } else if (event.event === 'Finished') {
            setUpdateStatus('Applying update...');
          }
        });
        setUpdateStatus("Update installed! Please restart the app.");
      } else {
        setHasUpdate(false);
        setUpdateStatus("You are on the latest version.");
      }
    } catch (err: any) {
      console.error("Update check failed:", err);
      setUpdateStatus(`Failed to check for updates: ${err.message || err}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return { updateStatus, isCheckingUpdate, hasUpdate, checkForUpdates };
}
