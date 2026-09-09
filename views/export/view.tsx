import { ModelContext, useOpenExternal, useToolContext } from "mcp-use/react";
import { AppShell, Card, ErrorState, PendingState, tw } from "../_shared/ui.js";

export default function ExportView() {
  const view = useToolContext<"view_export">();
  const openExternal = useOpenExternal();
  const output = view.status === "ready" ? view.toolOutput : undefined;
  const files = output?.files ?? [];

  if (view.status === "pending") {
    return (
      <AppShell kicker="Export" title="Attendance report">
        <PendingState label="Building the report…" />
      </AppShell>
    );
  }
  if (view.status === "error") {
    return (
      <AppShell kicker="Export" title="Attendance report">
        <ErrorState message={view.error.message} />
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Export" title="Attendance report" subtitle={output?.summary}>
      <ModelContext content={output?.summary ?? "Export ready."} />
      <Card title="Download">
        {files.length ? (
          <div className={tw.actions}>
            {files.map((file) => (
              <button
                key={file.url}
                type="button"
                className={tw.btnPrimary}
                onClick={() => void openExternal({ url: file.url })}
              >
                Download {file.name}
              </button>
            ))}
          </div>
        ) : (
          <p className={tw.empty}>No files.</p>
        )}
        {files.map((file) => (
          <p key={`${file.url}-link`} className={tw.sub}>
            {file.url}
          </p>
        ))}
      </Card>
    </AppShell>
  );
}
