import { Subscription } from "rxjs";
import { Project } from "src/models/project";

export type FolderCount = { group: string; count: number };

// "/" in a group name nests folders: "Marketing/Video" lives in "Marketing"
export const FOLDER_SEPARATOR = "/";

export class Folder {
  expanded = false;
  loading = false;
  renaming = false;
  projects: Project[] = [];
  children: Folder[] = [];
  loading$?: Subscription;
  // the stored group value, absent for folders that exist only as a path
  group?: string;
  count = 0;

  constructor(
    public path: string,
    public name: string,
    public parent?: Folder,
  ) {}

  // pipelines in this folder and every folder below it
  get total(): number {
    return this.children.reduce((sum, c) => sum + c.total, this.count);
  }

  get more(): boolean {
    return !!this.group && this.projects.length < this.count;
  }
}

export function buildFolders(counts: FolderCount[]): Folder[] {
  const roots: Folder[] = [];
  const byPath = new Map<string, Folder>();
  for (const { group, count } of counts) {
    const names = group
      .split(FOLDER_SEPARATOR)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    let parent: Folder | undefined;
    for (const name of names) {
      const path = parent ? `${parent.path}${FOLDER_SEPARATOR}${name}` : name;
      let folder = byPath.get(path);
      if (!folder) {
        folder = new Folder(path, name, parent);
        byPath.set(path, folder);
        (parent?.children ?? roots).push(folder);
      }
      parent = folder;
    }
    if (parent) {
      parent.group = group;
      parent.count += count;
    }
  }
  sortFolders(roots);
  return roots;
}

function sortFolders(folders: Folder[]) {
  folders.sort((a, b) => a.name.localeCompare(b.name));
  folders.forEach((f) => sortFolders(f.children));
}

export function findFolder(
  folders: Folder[],
  group: string,
): Folder | undefined {
  for (const folder of folders) {
    const found =
      folder.group === group ? folder : findFolder(folder.children, group);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function findFolderByPath(
  folders: Folder[],
  path: string,
): Folder | undefined {
  for (const folder of folders) {
    const found =
      folder.path === path ? folder : findFolderByPath(folder.children, path);
    if (found) {
      return found;
    }
  }
  return undefined;
}

// a folder stays visible when it or anything below it matches
export function matchFolder(folder: Folder, search: string): boolean {
  return (
    folder.name.toLowerCase().includes(search) ||
    folder.children.some((c) => matchFolder(c, search))
  );
}

// drops the project and the folders left empty by it
export function removeFromFolders(folders: Folder[], id: string): Folder[] {
  return folders.filter((folder) => {
    const projects = folder.projects.filter((p) => p._id !== id);
    folder.count -= folder.projects.length - projects.length;
    folder.projects = projects;
    folder.children = removeFromFolders(folder.children, id);
    return folder.total > 0;
  });
}
