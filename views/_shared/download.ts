export type ExportFile = {
  name: string;
  mimeType: string;
  base64?: string;
  url: string;
};

function downloadFromBase64(file: ExportFile) {
  if (!file.base64) {
    return false;
  }
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const href = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  const link = document.createElement("a");
  link.href = href;
  link.download = file.name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return true;
}

/** ChatGPT often has no openLinks. Prefer an in-view blob download, then the host, then a new tab. */
export async function saveExportedFile(
  file: ExportFile,
  openExternal: (args: { url: string }) => Promise<void>
) {
  if (downloadFromBase64(file)) {
    return;
  }
  try {
    await openExternal({ url: file.url });
  } catch {
    window.open(file.url, "_blank", "noopener,noreferrer");
  }
}
