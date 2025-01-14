import { create } from 'zustand'
import { API_URL } from 'app'
import { toast } from 'sonner'
import type { FileInfoOutput, RepoResponse } from 'types'

type RepoData = RepoResponse

interface PullStore {
  branches: string[]
  selectedBranch: string
  setBranches: (branches: string[]) => void
  setSelectedBranch: (branch: string) => void
  fetchBranches: (url: string) => Promise<void>
  isPulling: boolean
  isLoading: boolean
  error: string | null
  repoData: RepoData | null
  fetchRepo: (url: string) => Promise<void>
  reset: () => void
  pullFiles: () => Promise<void>
}

export const usePullStore = create<PullStore>((set, get) => ({
  branches: [],
  selectedBranch: "main",
  setBranches: (branches) => set({ branches }),
  setSelectedBranch: (branch) => set({ selectedBranch: branch }),
  fetchBranches: async (url) => {
    try {
      const response = await fetch(`${API_URL}/pull/api/get-branches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        credentials: 'include'
      })
      const data = await response.json()
      set({ branches: data.branches })
      // Set the first branch as selected if main or master is not available
      if (data.branches.length > 0 && 
          !data.branches.includes('main') && 
          !data.branches.includes('master')) {
        set({ selectedBranch: data.branches[0] })
      }
    } catch (error: any) {
      console.error('Failed to fetch branches:', error)
      set({ branches: [] })
    }
  },
  isLoading: false,
  isPulling: false,
  error: null,
  repoData: null,
  fetchRepo: async (url: string) => {
    const { selectedBranch } = get()
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/pull/api/fetch-repo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, branch: selectedBranch }),
        credentials: 'include'
      })
      const data = await response.json()
      console.log('API Response:', JSON.stringify(data, null, 2))
      set({ repoData: data, isLoading: false })
    } catch (error: any) {
      set({ 
        error: error.message || 'Failed to fetch repository', 
        isLoading: false 
      })
    }
  },
  reset: () => set({ isLoading: false, isPulling: false, error: null, repoData: null }),
  pullFiles: async () => {
    const { repoData } = get()
    if (!repoData) {
      toast.error('Please fetch repository info first')
      return
    }
    set({ isPulling: true, error: null })
    try {
      const response = await fetch(`${API_URL}/pull/api/pull-files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: repoData.contents }),
        credentials: 'include'
      })
      const data = await response.json()
      console.log('Pull Response:', JSON.stringify(data, null, 2))
      toast.success(`Successfully pulled ${data.created_files?.length || 0} files`)
      set({ isPulling: false })
    } catch (error: any) {
      set({ 
        error: error.message || 'Failed to pull repository files', 
        isPulling: false 
      })
      toast.error('Failed to pull repository files')
    }
  }
}))