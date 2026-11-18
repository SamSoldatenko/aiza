import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@mui/material';
import { Download, Trash2, Upload } from 'lucide-react';
import { deleteWorkspace } from '@/workspace/registry';
import { workspaceManager } from '@/workspace/WorkspaceManager';
import type { Workspace, WorkspaceData } from '@/workspace/Workspace';

const FORMAT = 'aiza-workspace-data/v1';

interface ExportFile {
  format: typeof FORMAT;
  workspaceId: string;
  data: WorkspaceData;
}

function isExportFile(value: unknown): value is ExportFile {
  const file = value as ExportFile | null;
  return typeof file === 'object' && file !== null && file.format === FORMAT
    && typeof file.data === 'object' && file.data !== null
    && typeof file.data.storage === 'object' && file.data.storage !== null && !Array.isArray(file.data.storage);
}

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Export, import and deletion of what a workspace keeps on this device.
// Offered for every workspace, supported or not.
export default function WorkspaceDataActions({ workspace }: { workspace: Workspace }): React.ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function handleExport(): void {
    const file: ExportFile = { format: FORMAT, workspaceId: workspace.id, data: workspace.exportData() };
    download(`aiza-${workspace.id}.json`, JSON.stringify(file, null, 2));
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isExportFile(parsed)) throw new Error('Not an Aiza workspace export');
      workspace.importData(parsed.data);
      await queryClient.invalidateQueries({ queryKey: workspace.queryKey() });
      setMessage(`Imported data exported from "${parsed.workspaceId}"`);
    } catch (err) {
      setMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleDelete(): void {
    if (workspaceManager.active?.id === workspace.id) workspaceManager.close();
    queryClient.removeQueries({ queryKey: workspace.queryKey() });
    deleteWorkspace(workspace.id);
    navigate({ to: '/workspaces' });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button size="small" variant="outlined" startIcon={<Download size={16} />} onClick={handleExport}>Export data</Button>
        <Button size="small" variant="outlined" startIcon={<Upload size={16} />} onClick={() => fileInput.current?.click()}>Import data</Button>
        {confirmingDelete ? (
          <>
            <Button size="small" variant="contained" color="error" startIcon={<Trash2 size={16} />} onClick={handleDelete}>
              Delete from this device
            </Button>
            <Button size="small" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={16} />} onClick={() => setConfirmingDelete(true)}>
            Delete…
          </Button>
        )}
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleImport} />
      </div>
      {confirmingDelete && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Deletes the workspace and all its data from this device. Export the data first to keep it.
        </p>
      )}
      {message && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>}
    </div>
  );
}
