import { setLastWorkspaceId } from '@/lib/storage';
import { createWorkspace } from './registry';
import type { Workspace } from './Workspace';

// Holds the single active workspace of this tab. Creation is createWorkspace's
// job; the manager initializes the new instance, disposes of the previous one
// and remembers which workspace was opened last.
export class WorkspaceManager {
  private current: Workspace | null = null;
  // The open() whose result counts: a later call supersedes earlier ones.
  private opening = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly create: (id: string) => Workspace = createWorkspace) {}

  get active(): Workspace | null {
    return this.current;
  }

  // Activates workspace `id`, unless it already is active. Rejects (and keeps
  // the active one) if it can't be created or initialized.
  async open(id: string): Promise<Workspace> {
    const ticket = ++this.opening;
    if (this.current?.id === id) return this.current;
    const workspace = this.create(id);
    await workspace.init();
    if (ticket !== this.opening) {
      // Another workspace was requested meanwhile.
      workspace.dispose();
      throw new Error(`Opening "${id}" was superseded`);
    }
    this.current?.dispose();
    this.current = workspace;
    setLastWorkspaceId(id);
    this.notify();
    return workspace;
  }

  close(): void {
    this.opening++;
    if (!this.current) return;
    this.current.dispose();
    this.current = null;
    this.notify();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const workspaceManager = new WorkspaceManager();
