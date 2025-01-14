import React, { useState } from "react";
import { Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RepoCard, RepoHistoryDialog } from "../components/Pull_comp";
import { usePullStore } from "../utils/Pull_util";
import { toast } from "sonner";
import { API_URL } from "app";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Pull_page() {
  const [url, setUrl] = useState("");
  const { branches, selectedBranch, setSelectedBranch, fetchBranches } = usePullStore();


  const { fetchRepo, repoData, isLoading, error } = usePullStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a GitHub repository URL");
      return;
    }
    try {
      await fetchBranches(url);
      await fetchRepo(url);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch repository");
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 px-8 py-4 max-w-[90%] mx-auto w-full">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">GitHub Repo Puller</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>GitHub Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Configure your GitHub token for accessing private repositories.
              </p>
              <Button
                onClick={async () => {
                  const token = prompt("Enter your GitHub personal access token");
                  if (!token) return;
                  
                  try {
                    const response = await fetch(`${API_URL}/pull/api/save-token`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ token }),
                      credentials: 'include'
                    });
                    if (!response.ok) throw new Error('Failed to save token');
                    toast.success("GitHub token saved successfully");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to save token");
                  }
                }}
              >
                Set GitHub Token
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-sm text-muted-foreground">
        Enter a GitHub repository URL to view its details
      </p>

      <div className="w-full">
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <Input
            type="url"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const historyButton = document.querySelector('[data-testid="history-button"]') as HTMLButtonElement;
              if (historyButton) historyButton.click();
            }}
          >
            History
          </Button>
          <Select 
            defaultValue={selectedBranch}
            onValueChange={(value) => {
              console.log('Branch selected:', value); // Debug log
              setSelectedBranch(value);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.length > 0 ? (
                branches.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="main">main</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Loading..." : "Fetch Info"}
          </Button>
          {repoData && (
            <Button
              type="button"
              onClick={() => {
                const pullButton = document.querySelector('[data-testid="pull-button"]') as HTMLButtonElement;
                if (pullButton) pullButton.click();
              }}
            >
              Pull Files
            </Button>
          )}
          {repoData && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUrl("");
                usePullStore.getState().reset();
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {error && (
          <div className="text-sm text-destructive mt-2">{error}</div>
        )}

        {repoData && (
          <div className="mt-4">
            <RepoCard 
              {...repoData} 
              onPullFiles={async (files) => {
                try {
                  const response = await fetch(`${API_URL}/pull/api/pull-files`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ files }),
                    credentials: 'include'
                  });
                  
                  if (!response.ok) {
                    throw new Error(`Failed to pull files: ${response.statusText}`);
                  }
                  
                  const data = await response.json();
                  
                  if (data.success) {
                    if (data.created_files?.length > 0) {
                      toast.success(`Successfully created ${data.created_files.length} files`);
                    } else {
                      toast.warning("No files were pulled");
                    }
                  } else {
                    toast.error(data.error || "Failed to pull files");
                  }
                } catch (error: any) {
                  console.error("Failed to pull files:", error);
                  toast.error("Failed to pull files");
                }
              }} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
