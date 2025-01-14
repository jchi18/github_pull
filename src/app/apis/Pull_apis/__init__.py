from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import requests
import re
import databutton as db
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Models
class FileInfo(BaseModel):
    name: str
    path: str
    type: str
    download_url: Optional[str]
    parent_path: Optional[str] = None
    children: List["FileInfo"] = []

class CreateFileRequest(BaseModel):
    filepath: str
    code: str
    commit_message: str

class CreateFileResponse(BaseModel):
    success: bool
    error: Optional[str] = None

class RepoRequest(BaseModel):
    url: str
    branch: Optional[str] = None

class BranchRequest(BaseModel):
    url: str

class BranchResponse(BaseModel):
    branches: List[str]

class TokenRequest(BaseModel):
    token: str

class PullFilesRequest(BaseModel):
    files: List[FileInfo]

class PullFilesResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    created_files: List[str] = []

class RepoResponse(BaseModel):
    name: str
    full_name: str
    description: Optional[str]
    stars: int
    forks: int
    language: Optional[str]
    owner_avatar: str
    html_url: str
    contents: List[FileInfo]
    timestamp: Optional[str] = None

class RepoHistoryResponse(BaseModel):
    repos: List[RepoResponse]

class DeleteRepoRequest(BaseModel):
    html_url: str

# Router
router = APIRouter(prefix="/pull/api", tags=["pull"])

@router.post("/get-branches")
def get_branches(request: BranchRequest) -> BranchResponse:
    try:
        owner, repo = extract_repo_path(request.url)
        headers = {"User-Agent": "Databutton-GitHub-Puller"}
        
        # Add token to headers if available
        try:
            github_token = db.secrets.get("GITHUB_TOKEN")
            if github_token:
                headers["Authorization"] = f"token {github_token}"
        except Exception:
            # No token available, continue without it
            pass

        response = requests.get(
            f"https://api.github.com/repos/{owner}/{repo}/branches",
            headers=headers
        )

        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository not found")
        elif response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="GitHub API error")

        branches_data = response.json()
        branch_names = [branch["name"] for branch in branches_data]
        return BranchResponse(branches=branch_names)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_branches: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from None

@router.post("/delete-repo")
def delete_repo(request: DeleteRepoRequest) -> dict:
    """Delete a repository from history."""
    try:
        # Get current history
        history = db.storage.json.get("pull_repo_history", default=[])
        
        # Remove the repo with matching html_url
        history = [repo for repo in history if repo["html_url"] != request.html_url]
        
        # Save updated history
        db.storage.json.put("pull_repo_history", history)
        
        return {"success": True}
    except Exception as e:
        print(f"Error in delete_repo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from None

# Helper functions
def fetch_directory_contents(owner: str, repo: str, path: str = "", headers: Optional[Dict] = None, parent_path: Optional[str] = None, depth: int = 0, max_depth: int = 5, file_count: Optional[Dict] = None, branch: Optional[str] = None) -> List[FileInfo]:
    """Fetch contents of a directory from GitHub recursively.
    Returns a flat list of all files and directories.
    
    Args:
        owner: Repository owner
        repo: Repository name
        path: Path within repository to fetch
        headers: Request headers
        parent_path: Parent directory path
        depth: Current recursion depth
        max_depth: Maximum recursion depth
        file_count: Dictionary to track file count (pass {"count": 0} to start tracking)
    """
    # Initialize file count if not provided
    if file_count is None:
        file_count = {"count": 0}
    
    # Check if we've hit the file limit
    if file_count["count"] >= 100:  # Limit to 100 files total
        print(f"Reached file limit of 100, stopping recursion")
        return []
    
    if headers is None:
        headers = {"User-Agent": "Databutton-GitHub-Puller"}
    
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"    
    if branch:
        url += f"?ref={branch}"
    url = url.rstrip('/')
    print(f"[{file_count['count']} files] Fetching {url}")
    response = requests.get(url, headers=headers)
    
    # Check rate limiting
    remaining = response.headers.get('X-RateLimit-Remaining')
    if remaining:
        print(f"GitHub API calls remaining: {remaining}")
    
    if response.status_code != 200:
        print(f"Failed to fetch contents for {path}: {response.status_code}")
        return []
    
    contents_data = response.json()
    if not isinstance(contents_data, list):
        contents_data = [contents_data]
    
    contents = []
    for item in contents_data:
        # Update file count
        file_count["count"] += 1
        print(f"Found {item['type']}: {item['path']} (parent: {parent_path})")
        file_info = FileInfo(
            name=item["name"],
            path=item["path"],
            type=item["type"],
            download_url=item.get("download_url"),
            parent_path=parent_path,
            children=[]
        )
        
        # Recursively fetch contents if it's a directory and we haven't reached max depth
        if item["type"] == "dir" and depth < max_depth and file_count["count"] < 100:
            sub_contents = fetch_directory_contents(owner, repo, item["path"], headers, item["path"], depth + 1, max_depth, file_count, branch)
            file_info.children = sub_contents
        
        contents.append(file_info)
    
    return contents

def extract_repo_path(url: str) -> Tuple[str, str]:
    pattern = r'github\.com/([\w-]+)/([\w-]+)'
    match = re.search(pattern, url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL format")
    return match.groups()

# Helper function for logging steps
def log_step(step: str, *args) -> None:
    print(f"[STEP] {step}:", *args)

@router.get("/history")
def get_repo_history() -> RepoHistoryResponse:
    """Get the history of fetched repositories."""
    try:
        # Get history from storage
        history = db.storage.json.get("pull_repo_history", default=[])
        if not isinstance(history, list):
            history = []
        return RepoHistoryResponse(repos=history)
    except Exception as e:
        print(f"Error in get_repo_history: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        # Return empty history on error
        return RepoHistoryResponse(repos=[])

@router.post("/save-token")
def save_token(body: TokenRequest) -> dict:
    try:
        db.secrets.put("GITHUB_TOKEN", body.token)
        return {"success": True}
    except Exception as e:
        print(f"Error in save_token: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from None

@router.post("/fetch-repo")
def fetch_repo(request: RepoRequest) -> RepoResponse:
    try:
        owner, repo = extract_repo_path(request.url)
        log_step("Setting up headers")
        headers = {"User-Agent": "Databutton-GitHub-Puller"}
        
        # Add token to headers if available
        try:
            github_token = db.secrets.get("GITHUB_TOKEN")
            if github_token:
                headers["Authorization"] = f"token {github_token}"
        except Exception:
            # No token available, continue without it
            pass
        
        # Get the branch from the request
        branch = request.branch
        
        response = requests.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers
        )
        
        if response.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository not found")
        elif response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="GitHub API error")
        
        data = response.json()
        
        # Fetch all contents recursively with file count tracking
        file_count = {"count": 0}
        contents = fetch_directory_contents(owner, repo, "", headers, file_count=file_count, branch=branch)
        
        # If a specific branch was requested, update the contents URL to use that branch
        if request.branch:
            for content in contents:
                if content.download_url:
                    content.download_url = content.download_url.replace("/master/", f"/{request.branch}/").replace("/main/", f"/{request.branch}/")
        print(f"Fetched {file_count['count']} files in total")
        
        # Create response
        response = RepoResponse(
            name=data["name"],
            full_name=data["full_name"],
            description=data["description"],
            stars=data["stargazers_count"],
            forks=data["forks_count"],
            language=data["language"],
            owner_avatar=data["owner"]["avatar_url"],
            html_url=data["html_url"],
            contents=contents,
            timestamp=datetime.now().isoformat()
        )
        
        # Update history
        try:
            history = db.storage.json.get("pull_repo_history", default=[])
            # Remove duplicates based on html_url
            history = [repo for repo in history if repo["html_url"] != response.html_url]
            # Add new repo to start of list
            history.insert(0, response.dict())
            # Keep only last 10 repos
            history = history[:10]
            db.storage.json.put("pull_repo_history", history)
        except Exception as e:
            print(f"Failed to update history: {e}")
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in fetch_repo: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from None

def get_storage_key(file_type: str, filename: str) -> str:
    """Create a storage key based on file type and name."""
    # Map of file types to storage prefixes
    type_prefixes: Dict[str, str] = {
        'py': 'backend',
        'tsx': 'component',
        'ts': 'util'
    }
    
    # Get extension and base name
    ext = filename.split('.')[-1] if '.' in filename else ''
    base_name = filename.split('.')[0]
    
    # Get prefix based on file type
    prefix = type_prefixes.get(ext, 'other')
    
    # Create storage key
    return f"{prefix}_{base_name}"

def determine_file_location(file_path: str, content: bytes) -> Optional[str]:
    """Determine where to save the file based on its path and content.
    Preserves original directory structure when appropriate."""
    # Split path into directory and filename
    path_parts = file_path.split('/')
    filename = path_parts[-1]
    
    # Get file extension
    ext = filename.split('.')[-1].lower() if '.' in filename else ''
    
    # Handle source directory structure
    if 'src' in path_parts:
        src_index = path_parts.index('src')
        sub_path = path_parts[src_index:]
        
        # Handle specific directories
        if 'pages' in sub_path:
            return f"ui/src/pages/{filename}"
        elif 'components' in sub_path:
            return f"ui/src/components/{filename}"
        elif 'util' in sub_path or 'utils' in sub_path:
            return f"ui/src/utils/{filename}"
        elif 'hooks' in sub_path:
            return f"ui/src/hooks/{filename}"
        elif 'backends' in sub_path and ext == 'py':
            return f"src/app/apis/{filename}"
    
    # Fallback to extension-based mapping
    if ext == 'py':
        return f"src/app/apis/{filename}"
    elif ext in ['tsx', 'jsx', 'ts', 'js']:
        if filename.startswith(('use', 'Use')):
            return f"ui/src/hooks/{filename}"
        elif 'page' in filename.lower() or filename == 'test1.tsx':
            return f"ui/src/pages/{filename}"
        elif 'component' in filename.lower():
            return f"ui/src/components/{filename}"
        else:
            return f"ui/src/utils/{filename}"
    elif ext in ['css', 'scss', 'sass']:
        return f"ui/src/styles/{filename}"
    
    # Return None for unsupported files
    return None

def read_file_content(url: str, headers: dict) -> Tuple[bytes, str]:
    """Read file content and detect if it's text or binary."""
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    content = response.content
    
    # Try to decode as text
    try:
        content.decode('utf-8')
        return content, 'text'
    except UnicodeDecodeError:
        return content, 'binary'

@router.post("/pull-files")
def pull_files(request: PullFilesRequest) -> PullFilesResponse:
    print("Starting pull_files with request:", request)
    print("Files to process:", [f"{f.type}: {f.path} ({f.download_url})" for f in request.files])
    
    try:
        headers = {"User-Agent": "Databutton-GitHub-Puller"}
        
        # Add token to headers if available
        try:
            github_token = db.secrets.get("GITHUB_TOKEN")
            if github_token:
                headers["Authorization"] = f"token {github_token}"
        except Exception:
            # No token available, continue without it
            pass

        log_step("Starting file processing")
        processed_files = []

        for file in request.files:
            if file.type != "file" or not file.download_url:
                print(f"Skipping {file.path}: type={file.type}, download_url={file.download_url}")
                continue

            try:
                log_step(f"Processing file", file.path)
                # Download and detect file type
                log_step("Downloading file content")
                content, content_type = read_file_content(file.download_url, headers)
                print(f"Downloaded {file.path} ({content_type})")
                
                log_step("Checking content type", content_type)
                # Only handle text files
                if content_type != 'text':
                    print(f"Skipped binary file: {file.path}")
                    continue
                
                log_step("Determining target location")
                target_path = determine_file_location(file.path, content)
                print(f"Target path for {file.path}: {target_path}")
                
                if target_path:
                    try:
                        file_content = content.decode('utf-8')
                        # Create a sanitized storage key
                        storage_key = re.sub(r'[^a-zA-Z0-9._-]', '_', f"pulled_file_{file.path}")
                        print(f"Using storage key: {storage_key}")
                        
                        # Save the file content
                        db.storage.text.put(storage_key, file_content)
                        processed_files.append({
                            "storage_key": storage_key,
                            "target_path": target_path,
                            "content": file_content
                        })
                        print(f"Saved file to storage: {storage_key}")
                    except Exception as e:
                        print(f"Failed to save file {target_path}: {str(e)}")
                        raise
                else:
                    print(f"No target path determined for {file.path}")
            except Exception as e:
                print(f"Failed to process {file.path}: {str(e)}")
                raise

        # Save the list of processed files to storage
        if processed_files:
            try:
                db.storage.json.put("pulled_files_list", processed_files)
                print(f"Saved list of {len(processed_files)} files to storage")
            except Exception as e:
                print(f"Failed to save files list: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to save files list: {str(e)}") from None

        return PullFilesResponse(
            success=True,
            created_files=[f["target_path"] for f in processed_files]
        )
    except Exception as e:
        print(f"Error in pull_files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from None
