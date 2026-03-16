// API service for communicating with the backend
import { GrafcetProject, GsrsmProject } from '../models/types';

import { API_BASE_URL } from '../config';

// Types for API requests and responses
export interface CreateProjectRequest {
  name: string;
  type: 'grafcet' | 'gsrsm';
  localPath: string;
}

export interface CreateProjectResponse {
  success: boolean;
  project?: GrafcetProject | GsrsmProject;
  error?: string;
  projectPath?: string;
}

export interface SaveProjectRequest {
  project: GrafcetProject | GsrsmProject;
  type: 'grafcet' | 'gsrsm';
}

export interface SaveProjectResponse {
  success: boolean;
  error?: string;
  savedPath?: string;
}

export interface LoadProjectRequest {
  projectPath: string;
}

export interface LoadProjectResponse {
  success: boolean;
  project?: GrafcetProject | GsrsmProject;
  error?: string;
}

export interface LoadDiagramRequest {
  diagramPath: string;
}

export interface LoadDiagramResponse {
  success: boolean;
  diagram?: Record<string, unknown>;
  error?: string;
}

export interface SaveDiagramRequest {
  diagramPath: string;
  diagram: Record<string, unknown>;
}

export interface SaveDiagramResponse {
  success: boolean;
  error?: string;
  savedPath?: string;
}

export interface ListProjectsResponse {
  success: boolean;
  projects?: Array<{
    name: string;
    path: string;
    type: 'grafcet' | 'gsrsm';
    lastModified: string;
  }>;
  error?: string;
}

export interface BrowseDirectoryResponse {
  success: boolean;
  path?: string;
  parent?: string;
  contents?: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    lastModified: string;
  }>;
  error?: string;
}

export interface DrivesResponse {
  success: boolean;
  drives?: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
  }>;
  error?: string;
}

// File creation types
export type FileType = 'grafcet' | 'gsrsm' | 'folder' | 'custom';

export interface CreateFileRequest {
  parentPath: string;
  fileName: string;
  fileType: FileType;
  customExtension?: string;
}

export interface CreateFileResponse {
  success: boolean;
  filePath?: string;
  fileData?: Record<string, unknown>;
  error?: string;
}

export interface CreateModeGrafcetRequest {
  projectPath: string;
  modeCode: string;
}

export interface CreateModeGrafcetResponse {
  success: boolean;
  filePath?: string;
  grafcet?: Record<string, unknown>;
  error?: string;
}

// Helper to get headers with auth token
const getHeaders = (): HeadersInit => {
  // Access the store directly to get the token, assuming store persistence works
  try {
    const storageItem = localStorage.getItem('grafcet-editor-auth');
    if (storageItem) {
      const { state } = JSON.parse(storageItem);
      const token = state?.token;
      if (token) {
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
      }
    }
  } catch (e) {
    // Ignore error accessing local storage
  }

  return {
    'Content-Type': 'application/json',
  };
};

export class ApiService {
  /**
   * Create a new project with local folder structure
   */
  static async createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/create`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating project:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Save an existing project to the file system
   */
  static async saveProject(request: SaveProjectRequest): Promise<SaveProjectResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/save`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error saving project:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Load a project from the file system
   */
  static async loadProject(request: LoadProjectRequest): Promise<LoadProjectResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/load`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading project:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Load a single diagram file from the file system
   */
  static async loadDiagram(request: LoadDiagramRequest): Promise<LoadDiagramResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/load-diagram`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading diagram:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Save a single diagram file to the file system
   */
  static async saveDiagram(request: SaveDiagramRequest): Promise<SaveDiagramResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/save-diagram`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error saving diagram:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * List all projects in a directory
   */
  static async listProjects(basePath: string): Promise<ListProjectsResponse> {
    try {
      const encodedPath = encodeURIComponent(basePath);
      const headers = getHeaders();
      const response = await fetch(`${API_BASE_URL}/projects/list/${encodedPath}`, {
        headers // Fetch GET accepts headers/init as second arg
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error listing projects:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Delete a project
   */
  static async deleteProject(projectPath: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/delete`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ projectPath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting project:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Validate if a path exists and is accessible
   */
  static async validatePath(path: string): Promise<{ success: boolean; isValid?: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/validate-path`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ path }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error validating path:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Browse directories and files
   */
  static async browseDirectory(path: string = ''): Promise<BrowseDirectoryResponse> {
    try {
      const encodedPath = encodeURIComponent(path);
      const response = await fetch(`${API_BASE_URL}/files/browse/${encodedPath}`, {
        headers: getHeaders()
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error browsing directory:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Browse project folder contents
   */
  static async browseProjectFolder(projectPath: string): Promise<BrowseDirectoryResponse> {
    try {
      const encodedPath = encodeURIComponent(projectPath);
      const response = await fetch(`${API_BASE_URL}/files/browse/${encodedPath}`, {
        headers: getHeaders()
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error browsing project folder:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Get available drives
   */
  static async getDrives(): Promise<DrivesResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/drives`, {
        headers: getHeaders()
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting drives:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Create a new folder
   */
  static async createFolder(parentPath: string, folderName: string): Promise<{ success: boolean; folderPath?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/create-folder`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ parentPath, folderName }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating folder:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Check if a folder is empty
   */
  static async checkFolderEmpty(folderPath: string): Promise<{ success: boolean; isEmpty?: boolean; fileCount?: number; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/check-folder-empty`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ folderPath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error checking folder:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Delete a folder and all its contents
   */
  static async deleteFolder(folderPath: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/delete-folder`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ folderPath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting folder:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Open file explorer at specified path
   */
  static async openFileExplorer(path?: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/open-explorer`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ path }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error opening file explorer:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Check if backend is available
   */
  static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
      const data = await response.json();
      return data.status === 'OK';
    } catch (error) {
      console.error('Backend health check failed:', error);
      return false;
    }
  }

  /**
   * Create a new file (grafcet, gsrsm, folder, or custom)
   */
  static async createFile(request: CreateFileRequest): Promise<CreateFileResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/create-file`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating file:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Create a GRAFCET file for an activated GSRSM mode
   */
  static async createModeGrafcet(request: CreateModeGrafcetRequest): Promise<CreateModeGrafcetResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/create-mode-grafcet`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating mode GRAFCET:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Delete a GSRSM mode folder
   */
  static async deleteModeFolder(projectPath: string, modeCode: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/delete-mode`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ projectPath, modeCode }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting mode folder:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Get hierarchical file tree structure for file explorer
   */
  static async getFileTree(path: string): Promise<{ success: boolean; tree?: any; error?: string }> {
    try {
      const encodedPath = encodeURIComponent(path);
      const response = await fetch(`${API_BASE_URL}/files/tree?path=${encodedPath}`, {
        headers: getHeaders()
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting file tree:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Delete a file or folder
   */
  static async deleteItem(itemPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/delete-item`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ itemPath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error deleting item:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Rename a file or folder
   */
  static async renameItem(oldPath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/rename`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ oldPath, newName }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error renaming item:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Copy a file or folder
   */
  static async copyItem(sourcePath: string, targetParentPath: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/copy`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ sourcePath, targetParentPath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error copying item:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Save simulation configuration
   */
  static async saveSimulation(projectPath: string, simulation: any): Promise<{ success: boolean; savedPath?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/simulation/save`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ projectPath, simulation }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error saving simulation:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Load simulation configuration
   */
  static async loadSimulation(projectPath: string): Promise<{ success: boolean; simulation?: any; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/simulation/load`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ projectPath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading simulation:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Read a text file (markdown, txt, etc.)
   */
  static async readTextFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/read-text`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ filePath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error reading text file:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Get media file (image/video) as base64 data URL
   */
  static async getMediaFile(filePath: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/files/read-media`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ filePath }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error reading media file:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Generate system image using Nano Banana Pro (Gemini 3 Pro Image)
   */
  static async generateSystemImage(projectPath: string, customPrompt?: string): Promise<{
    success: boolean;
    imagePath?: string;
    imageBase64?: string;
    error?: string;
    prompt?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/render/image`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ projectPath, customPrompt }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error generating system image:', error);
      return {
        success: false,
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Start video generation using Veo 3.1
   */
  static async generateSystemVideo(
    projectPath: string,
    imageBase64?: string,
    customPrompt?: string
  ): Promise<{
    success: boolean;
    status: string;
    operationName?: string;
    error?: string;
    prompt?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/render/video`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ projectPath, imageBase64, customPrompt }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error generating system video:', error);
      return {
        success: false,
        status: 'error',
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Check video generation status
   */
  static async checkVideoStatus(operationName: string): Promise<{
    success: boolean;
    status: string;
    videoPath?: string;
    imageBase64?: string;
    videoBase64?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/render/video/status/${encodeURIComponent(operationName)}`, {
        headers: getHeaders()
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error checking video status:', error);
      return {
        success: false,
        status: 'error',
        error: 'Failed to communicate with backend server'
      };
    }
  }

  /**
   * Download completed video
   */
  static async downloadVideo(videoUri: string, projectPath: string): Promise<{
    success: boolean;
    status: string;
    videoPath?: string;
    videoBase64?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/render/video/download`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ videoUri, projectPath }),
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error downloading video:', error);
      return {
        success: false,
        status: 'error',
        error: 'Failed to communicate with backend server'
      };
    }
  }
}
