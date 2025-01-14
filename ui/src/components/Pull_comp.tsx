import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronDown, History, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { API_URL } from "app";

interface FileInfo {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
  parent_path: string | null;
  children: FileInfo[];
}

interface RepoData {
  name: string;
  full_name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  owner_avatar: string;
  html_url: string;
  contents: FileInfo[];
  timestamp?: string;
}

interface RepoHistoryProps {
  onSelectRepo: (repo: RepoData) => void;
}

interface RepoCardProps extends RepoData {
  onPullFiles?: (files: FileInfo[]) => Promise<void>;
}

function getAllFiles(file: FileInfo): FileInfo[] {
  let files: FileInfo[] = [];
  if (file.type === "file") {
    files.push(file);
  }
  if (file.children) {
    for (const child of file.children) {
      files = files.concat(getAllFiles(child));
    }
  }
  return files;
}

function getFileCategory(path: string): string {
  if (path.includes('/apis/')) return 'backend';
  if (path.includes('/components/')) return 'component';
  if (path.includes('/utils/')) return 'util';
  if (path.includes('/pages/')) return 'page';
  return 'other';
}

type SortColumn = 'name' | 'path' | 'category';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}

function FileListItem({ file, selectedFiles, onToggleFile }: {
  file: FileInfo;
  selectedFiles: Set<string>;
  onToggleFile: (path: string, checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 hover:bg-accent/50 rounded-sm px-2 py-1">
      <div className="w-8">
        <Checkbox
          checked={selectedFiles.has(file.path)}
          onCheckedChange={(checked) => onToggleFile(file.path, checked === true)}
        />
      </div>
      <div className="w-48 text-sm truncate">{file.name}</div>
      <div className="flex-1 text-sm text-muted-foreground font-mono">{file.path}</div>
      <div className="w-28 text-sm text-muted-foreground">{getFileCategory(file.path)}</div>
    </div>
  );
}

function sortFiles(files: FileInfo[], sortConfig: SortConfig): FileInfo[] {
  return [...files].sort((a, b) => {
    let compareResult = 0;
    switch (sortConfig.column) {
      case 'name':
        compareResult = a.name.localeCompare(b.name);
        break;
      case 'path':
        compareResult = a.path.localeCompare(b.path);
        break;
      case 'category':
        compareResult = getFileCategory(a.path).localeCompare(getFileCategory(b.path));
        break;
    }
    return sortConfig.direction === 'asc' ? compareResult : -compareResult;
  });
}

export function RepoCard({
  name,
  full_name,
  description,
  stars,
  forks,
  language,
  owner_avatar,
  html_url,
  contents,
  onPullFiles,
}: RepoCardProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'name', direction: 'asc' });

  const handleSort = (column: SortColumn) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };


  const handleToggleFile = (path: string, checked: boolean) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allFiles = contents
      .filter(file => !file.parent_path)
      .flatMap(getAllFiles)
      .map(f => f.path);
    setSelectedFiles(new Set(allFiles));
  };

  const handleDeselectAll = () => {
    setSelectedFiles(new Set());
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{name}</h2>
        <a
          href={html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          View on GitHub
        </a>
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
        >
          Select All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDeselectAll}
        >
          Deselect All
        </Button>
        <span className="text-sm text-muted-foreground">
          {selectedFiles.size} files selected
        </span>
      </div>

      <div className="border rounded-lg">
        <div className="flex items-center gap-4 bg-muted px-2 py-1 border-b">
          <div className="w-8"></div>
          <button
            onClick={() => handleSort('name')}
            className="w-48 font-medium text-sm flex items-center gap-1 hover:text-foreground"
          >
            Name
            {sortConfig.column === 'name' ? (
              sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
            )}
          </button>
          <button
            onClick={() => handleSort('path')}
            className="flex-1 font-medium text-sm flex items-center gap-1 hover:text-foreground"
          >
            Path
            {sortConfig.column === 'path' ? (
              sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
            )}
          </button>
          <button
            onClick={() => handleSort('category')}
            className="w-28 font-medium text-sm flex items-center gap-1 hover:text-foreground"
          >
            Category
            {sortConfig.column === 'category' ? (
              sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUpDown className="h-4 w-4 opacity-50" />
            )}
          </button>
        </div>
        <div className="p-1 space-y-1">
          {contents
            .flatMap(getAllFiles)
            .sort((a, b) => sortFiles([a, b], sortConfig)[0] === a ? -1 : 1)
            .map((file) => (
              <FileListItem
                key={file.path}
                file={file}
                selectedFiles={selectedFiles}
                onToggleFile={handleToggleFile}
              />
            ))}
        </div>
      </div>

      <Button
        className="w-full"
        data-testid="pull-button"
        onClick={async () => {
          try {
            const allFiles = contents
              .filter(file => !file.parent_path)
              .flatMap(getAllFiles)
              .filter(file => selectedFiles.has(file.path));
            
            if (allFiles.length === 0) {
              toast.warning("Please select files to pull");
              return;
            }
            
            if (onPullFiles) {
              await onPullFiles(allFiles);
            }
          } catch (error) {
            console.error("Failed to pull files:", error);
            toast.error("Failed to pull files");
          }
        }}
      >
        Pull Selected Files
      </Button>
    </div>
  );
}

export function RepoHistoryDialog({ onSelectRepo }: RepoHistoryProps) {
  const [repos, setRepos] = React.useState<RepoData[]>([]);
  const [open, setOpen] = React.useState(false);

  const fetchHistory = () => {
    fetch(`${API_URL}/pull/api/history`, {
      method: 'GET',
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => setRepos(data?.repos || []))
      .catch((error) => console.error("Failed to fetch repo history:", error));
  };

  React.useEffect(() => {
    if (open) {
      fetchHistory();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="history-button">
          <History className="h-4 w-4" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recently Viewed Repositories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {repos.map((repo) => (
            <div
              key={repo.html_url}
              className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-accent/50"
              onClick={() => {
                onSelectRepo(repo);
                setOpen(false);
              }}
            >
              <div>
                <h3 className="font-medium">{repo.name}</h3>
                <p className="text-sm text-muted-foreground">{repo.full_name}</p>
              </div>
              {repo.timestamp && (
                <span className="text-xs text-muted-foreground">
                  {new Date(repo.timestamp).toLocaleString()}
                </span>
              )}
            </div>
          ))}
          {repos.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No repository history yet
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
