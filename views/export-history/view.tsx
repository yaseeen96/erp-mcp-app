import { ModelContext, useOpenExternal, useToolContext } from "mcp-use/react";
import { saveExportedFile } from "../_shared/download.js";
import {
  AppShell,
  Card,
  ErrorState,
  PendingState,
  tw,
} from "../_shared/ui.js";

export default function ExportHistoryView() {
  const view = useToolContext<"export-history">();
  const openExternal = useOpenExternal();

  if (view.status === "pending") {
    return (
      <AppShell kicker="Export" title="Preparing files">
        <PendingState label="Building your Excel and PDF…" />
      </AppShell>
    );
  }

  if (view.status === "error") {
    return (
      <AppShell kicker="Export" title="Export failed">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  const files = view.toolOutput.files;

  return (
    <AppShell kicker="Export" title="Files ready" subtitle={view.toolOutput.summary}>
      <ModelContext content={`Export ready: ${files.map((file) => file.name).join(", ")}`} />
      <Card title="Download">
        <p className={tw.sub}>Click a button to download the file.</p>
        <div className={`${tw.actions} mt-3`}>
          {files.map((file) => (
            <button
              key={file.name}
              type="button"
              className={tw.btnPrimary}
              onClick={() => void saveExportedFile(file, openExternal)}
            >
              Download {file.name.endsWith(".pdf") ? "PDF" : "Excel"}
            </button>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
