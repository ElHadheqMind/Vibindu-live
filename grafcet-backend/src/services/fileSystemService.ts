import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getStorageService } from './storageService.js';
import {
  GrafcetProject,
  GsrsmProject,
  GrafcetDiagram,
  ProjectStructure,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateFileRequest,
  CreateFileResponse,
  CreateModeGrafcetRequest,
  CreateModeGrafcetResponse,
  FileType
} from '../types/index.js';

/**
 * FileSystemService - Refactored to use Flydrive for storage operations
 * Manages GRAFCET and GSRSM projects with abstracted storage layer
 */
export class FileSystemService {
  private static storage = getStorageService();

  /**
   * Get the base storage path
   */
  static getBaseStoragePath(): string {
    return this.storage.getBasePath();
  }


  /**
   * Create a new project folder structure based on type
   */
  static async createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    try {
      const { name, type, localPath } = request;
      const sanitizedName = this.storage.sanitizeFileName(name);

      // Convert absolute localPath to relative storage path
      const relativePath = this.storage.getRelativePath(localPath);
      const projectPath = path.join(relativePath, sanitizedName).replace(/\\/g, '/');

      // Check if project folder already exists
      if (await this.storage.exists(projectPath)) {
        return {
          success: false,
          error: `Project folder "${sanitizedName}" already exists in the selected location.`
        };
      }

      // Create project folder
      await this.storage.ensureDirectory(projectPath);

      if (type === 'grafcet') {
        return await this.createGrafcetProject(name, projectPath);
      } else {
        return await this.createGsrsmProject(name, projectPath);
      }
    } catch (error) {
      console.error('Error creating project:', error);
      return {
        success: false,
        error: `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a GRAFCET project structure (Single File Project)
   */
  private static async createGrafcetProject(name: string, projectPath: string): Promise<CreateProjectResponse> {
    const timestamp = new Date().toISOString();

    // Create main diagram
    const mainDiagram: GrafcetDiagram = {
      id: uuidv4(),
      name: name, // Use project name for the diagram
      elements: [],
      version: '1.0',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Create project object
    const project: GrafcetProject = {
      id: uuidv4(),
      name,
      diagrams: [mainDiagram],
      createdAt: timestamp,
      updatedAt: timestamp,
      localPath: this.storage.getAbsolutePath(projectPath)
    };

    // Save project file
    const projectFilePath = path.join(projectPath, 'project.json').replace(/\\/g, '/');
    await this.storage.writeJson(projectFilePath, project);

    // Save main diagram directly in project root (no diagrams folder)
    const diagramFilePath = path.join(projectPath, `${name}.sfc`).replace(/\\/g, '/');
    await this.storage.writeJson(diagramFilePath, mainDiagram);

    // Create default simulation configuration file (index.sim)
    const simFilePath = path.join(projectPath, 'index.sim').replace(/\\/g, '/');
    const defaultSimulation = {
      variables: [],
      actions: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.storage.writeJson(simFilePath, defaultSimulation);

    return {
      success: true,
      project,
      projectPath: this.storage.getAbsolutePath(projectPath)
    };
  }

  /**
   * Create a GSRSM project structure (full project with subfolders)
   */
  private static async createGsrsmProject(name: string, projectPath: string): Promise<CreateProjectResponse> {
    const timestamp = new Date().toISOString();

    // Create GSRSM project object
    const project: GsrsmProject = {
      id: uuidv4(),
      name,
      diagram: {
        id: uuidv4(),
        name: 'GSRSM Diagram',
        modes: [],
        version: '1.0',
        createdAt: timestamp,
        updatedAt: timestamp
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      localPath: this.storage.getAbsolutePath(projectPath)
    };

    // Save main GSRSM file as main.gsrsm
    const gsrsmFilePath = path.join(projectPath, 'main.gsrsm').replace(/\\/g, '/');
    await this.storage.writeJson(gsrsmFilePath, project);

    // Create 'conduct.sfc'
    const conduiteFilePath = path.join(projectPath, 'conduct.sfc').replace(/\\/g, '/');
    const conduiteGrafcet = {
      id: uuidv4(),
      name: 'Conduct GRAFCET',
      elements: [],
      version: '1.0',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.storage.writeJson(conduiteFilePath, conduiteGrafcet);

    // Create empty modes folder (mode folders created when modes are activated)
    const modesPath = path.join(projectPath, 'modes').replace(/\\/g, '/');
    await this.storage.ensureDirectory(modesPath);

    // Create default simulation configuration file (index.sim)
    const simFilePath = path.join(projectPath, 'index.sim').replace(/\\/g, '/');
    const defaultSimulation = {
      variables: [],
      actions: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.storage.writeJson(simFilePath, defaultSimulation);

    return {
      success: true,
      project,
      projectPath: this.storage.getAbsolutePath(projectPath)
    };
  }

  /**
   * Save project to file system
   */
  static async saveProject(project: GrafcetProject | GsrsmProject, type: 'grafcet' | 'gsrsm'): Promise<boolean> {
    try {
      if (!project.localPath) {
        throw new Error('Project has no local path specified');
      }

      const timestamp = new Date().toISOString();
      const updatedProject = { ...project, updatedAt: timestamp };

      if (type === 'grafcet') {
        return await this.saveGrafcetProject(updatedProject as GrafcetProject);
      } else {
        return await this.saveGsrsmProject(updatedProject as GsrsmProject);
      }
    } catch (error) {
      console.error('Error saving project:', error);
      return false;
    }
  }

  /**
   * Save GRAFCET project
   */
  private static async saveGrafcetProject(project: GrafcetProject): Promise<boolean> {
    const projectPath = this.storage.getRelativePath(project.localPath!);

    // Save main project file
    const projectFilePath = path.join(projectPath, 'project.json').replace(/\\/g, '/');
    await this.storage.writeJson(projectFilePath, project);

    // Save individual diagrams
    // For the simplified structure, currently we only have one SFC likely named after the project or inside the list
    // If we want to support multiple diagrams in the future, we might need a folder. 
    // But for now, we just save them. If there is a diagrams folder, we use it, if not, root?
    // Let's check if 'diagrams' folder exists.
    const diagramsPath = path.join(projectPath, 'diagrams').replace(/\\/g, '/');
    const hasDiagramsFolder = await this.storage.exists(diagramsPath);

    if (hasDiagramsFolder) {
      // Legacy/Full structure behavior
      for (const diagram of project.diagrams) {
        const diagramFilePath = path.join(diagramsPath, `${diagram.id}.sfc`).replace(/\\/g, '/');
        await this.storage.writeJson(diagramFilePath, diagram);
      }
    } else {
      // Single file structure behavior - save to root
      for (const diagram of project.diagrams) {
        // Use diagram name or ID. For single file project, usually name matches project.
        // We'll use ID to be safe or name if we want friendly names. 
        // In createGrafcetProject we used `${name}.sfc`.
        // Let's try to match existing files or default to ID.
        const friendlyNameName = `${diagram.name}.sfc`;
        const friendlyPath = path.join(projectPath, friendlyNameName).replace(/\\/g, '/');
        await this.storage.writeJson(friendlyPath, diagram);
      }
    }

    return true;
  }

  /**
   * Save GSRSM project
   */
  private static async saveGsrsmProject(project: GsrsmProject): Promise<boolean> {
    const projectPath = this.storage.getRelativePath(project.localPath!);

    // Save main GSRSM file
    const mainGsrsmPath = path.join(projectPath, 'main.gsrsm').replace(/\\/g, '/');
    await this.storage.writeJson(mainGsrsmPath, project);

    return true;
  }

  /**
   * Load project from file system
   */
  static async loadProject(projectPath: string): Promise<GrafcetProject | GsrsmProject | null> {
    try {
      const relativePath = this.storage.getRelativePath(projectPath);

      // Check if it's a GRAFCET project
      const grafcetProjectPath = path.join(relativePath, 'project.json').replace(/\\/g, '/');
      if (await this.storage.exists(grafcetProjectPath)) {
        const project = await this.storage.readJson<GrafcetProject>(grafcetProjectPath);

        // Load diagrams
        // First check 'diagrams' folder
        const diagramsPath = path.join(relativePath, 'diagrams').replace(/\\/g, '/');
        const diagrams: GrafcetDiagram[] = [];

        if (await this.storage.exists(diagramsPath)) {
          const diagramFiles = await this.storage.listDirectory(diagramsPath);
          for (const file of diagramFiles) {
            if ((file.name.endsWith('.sfc') || file.name.endsWith('.json')) && file.name !== '.keep') {
              const diagramPath = path.join(diagramsPath, file.name).replace(/\\/g, '/');
              const diagram = await this.storage.readJson<GrafcetDiagram>(diagramPath);
              diagrams.push(diagram);
            }
          }
        } else {
          // Check root for .sfc files
          const rootFiles = await this.storage.listDirectory(relativePath);
          for (const file of rootFiles) {
            if (file.name.endsWith('.sfc')) {
              const diagramPath = path.join(relativePath, file.name).replace(/\\/g, '/');
              const diagram = await this.storage.readJson<GrafcetDiagram>(diagramPath);
              diagrams.push(diagram);
            }
          }
        }

        project.diagrams = diagrams;
        project.localPath = this.storage.getAbsolutePath(relativePath);
        return project;
      }

      // Check if it's a GSRSM project
      const mainGsrsmPath = path.join(relativePath, 'main.gsrsm').replace(/\\/g, '/');

      let gsrsmPathToLoad = null;
      if (await this.storage.exists(mainGsrsmPath)) {
        gsrsmPathToLoad = mainGsrsmPath;
      }

      if (gsrsmPathToLoad) {
        const project = await this.storage.readJson<GsrsmProject>(gsrsmPathToLoad);
        project.localPath = this.storage.getAbsolutePath(relativePath);
        return project;
      }

      return null;
    } catch (error) {
      console.error('Error loading project:', error);
      return null;
    }
  }

  /**
   * List all projects in a directory
   */
  static async listProjects(basePath: string): Promise<ProjectStructure[]> {
    try {
      const projects: ProjectStructure[] = [];
      const relativePath = this.storage.getRelativePath(basePath);
      const items = await this.storage.listDirectory(relativePath);

      for (const item of items) {
        if (item.isDirectory) {
          const itemPath = path.join(relativePath, item.name).replace(/\\/g, '/');
          const metadata = await this.storage.getMetadata(itemPath);

          // Check if it's a GRAFCET project
          const grafcetProjectPath = path.join(itemPath, 'project.json').replace(/\\/g, '/');
          if (await this.storage.exists(grafcetProjectPath)) {
            const files = await this.storage.listDirectory(itemPath);
            projects.push({
              type: 'grafcet',
              name: item.name,
              path: this.storage.getAbsolutePath(itemPath),
              files: files.map(f => f.name),
              lastModified: metadata?.lastModified?.toISOString() || new Date().toISOString()
            });
            continue;
          }

          // Check if it's a GSRSM project
          const mainGsrsmPath = path.join(itemPath, 'main.gsrsm').replace(/\\/g, '/');

          if (await this.storage.exists(mainGsrsmPath)) {
            const files = await this.storage.listDirectory(itemPath);
            const modesPath = path.join(itemPath, 'modes').replace(/\\/g, '/');
            let folders: string[] = [];

            if (await this.storage.exists(modesPath)) {
              const modeItems = await this.storage.listDirectory(modesPath);
              folders = modeItems.filter(f => f.isDirectory).map(f => f.name);
            }

            projects.push({
              type: 'gsrsm',
              name: item.name,
              path: this.storage.getAbsolutePath(itemPath),
              files: files.map(f => f.name),
              folders,
              lastModified: metadata?.lastModified?.toISOString() || new Date().toISOString()
            });
            continue;
          }

          // If the folder is lacking project.json or main.gsrsm, it might be an incomplete project.
          // We still return it so the user can see and delete it from the Recent Projects list.
          const files = await this.storage.listDirectory(itemPath);
          const hasSfc = files.some(f => f.name.endsWith('.sfc'));
          
          projects.push({
            type: hasSfc ? 'grafcet' : 'gsrsm', // Default type based on contents
            name: item.name,
            path: this.storage.getAbsolutePath(itemPath),
            files: files.map(f => f.name),
            lastModified: metadata?.lastModified?.toISOString() || new Date().toISOString()
          });
        }
      }

      return projects;
    } catch (error) {
      console.error('Error listing projects:', error);
      return [];
    }
  }

  /**
   * Check if a path is valid and accessible
   */
  static async validatePath(folderPath: string): Promise<boolean> {
    try {
      // Pass the path directly to StorageService
      // It handles checking if it's absolute (via fs) or relative (via flydrive)
      const exists = await this.storage.validatePath(folderPath);
      console.log(`[FileSystemService] Validating path: "${folderPath}", exists: ${exists}`);
      return exists;
    } catch (error) {
      console.error(`[FileSystemService] Error validating path "${folderPath}":`, error);
      return false;
    }
  }

  /**
   * Ensure a directory exists
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    await this.storage.ensureDirectory(dirPath);
  }

  /**
   * Create a new file (grafcet, gsrsm, folder, or custom)
   */
  static async createFile(request: CreateFileRequest): Promise<CreateFileResponse> {
    try {
      const { parentPath, fileName, fileType, customExtension } = request;
      const sanitizedName = this.storage.sanitizeFileName(fileName);

      // Validate parent path exists
      if (!await this.validatePath(parentPath)) {
        return {
          success: false,
          error: 'Parent directory does not exist'
        };
      }

      switch (fileType) {
        case 'grafcet':
          return await this.createGrafcetFile(parentPath, sanitizedName);
        case 'gsrsm':
          return await this.createGsrsmFile(parentPath, sanitizedName);
        case 'folder':
          return await this.createFolder(parentPath, sanitizedName);
        case 'custom':
          return await this.createCustomFile(parentPath, sanitizedName, customExtension);
        default:
          return {
            success: false,
            error: 'Invalid file type'
          };
      }
    } catch (error) {
      console.error('Error creating file:', error);
      return {
        success: false,
        error: `Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a new GRAFCET file
   */
  private static async createGrafcetFile(parentPath: string, fileName: string): Promise<CreateFileResponse> {
    const timestamp = new Date().toISOString();
    const grafcetFileName = fileName.endsWith('.sfc') ? fileName : `${fileName}.sfc`;
    const relativePath = this.storage.getRelativePath(parentPath);
    const filePath = path.join(relativePath, grafcetFileName).replace(/\\/g, '/');

    // Check if file already exists
    if (await this.storage.exists(filePath)) {
      return {
        success: false,
        error: `File "${grafcetFileName}" already exists`
      };
    }

    const grafcet: GrafcetDiagram = {
      id: uuidv4(),
      name: fileName.replace('.sfc', '').replace('.json', ''),
      elements: [],
      version: '1.0',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await this.storage.writeJson(filePath, grafcet);

    return {
      success: true,
      filePath: this.storage.getAbsolutePath(filePath),
      fileData: grafcet
    };
  }

  /**
   * Create a new GSRSM file
   */
  private static async createGsrsmFile(parentPath: string, fileName: string): Promise<CreateFileResponse> {
    const timestamp = new Date().toISOString();
    const gsrsmFileName = fileName.endsWith('.gsrsm') ? fileName : `${fileName}.gsrsm`;
    const relativePath = this.storage.getRelativePath(parentPath);
    const filePath = path.join(relativePath, gsrsmFileName).replace(/\\/g, '/');

    // Check if file already exists
    if (await this.storage.exists(filePath)) {
      return {
        success: false,
        error: `File "${gsrsmFileName}" already exists`
      };
    }

    const gsrsmDiagram = {
      id: uuidv4(),
      name: fileName.replace('.gsrsm', '').replace('.json', ''),
      modes: [],
      version: '1.0',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await this.storage.writeJson(filePath, gsrsmDiagram);

    return {
      success: true,
      filePath: this.storage.getAbsolutePath(filePath),
      fileData: gsrsmDiagram
    };
  }

  /**
   * Create a new folder
   */
  private static async createFolder(parentPath: string, folderName: string): Promise<CreateFileResponse> {
    const relativePath = this.storage.getRelativePath(parentPath);
    const folderPath = path.join(relativePath, folderName).replace(/\\/g, '/');

    // Check if folder already exists
    if (await this.storage.exists(folderPath)) {
      return {
        success: false,
        error: `Folder "${folderName}" already exists`
      };
    }

    await this.storage.ensureDirectory(folderPath);

    return {
      success: true,
      filePath: this.storage.getAbsolutePath(folderPath)
    };
  }

  /**
   * Create a custom file with specified extension
   */
  private static async createCustomFile(parentPath: string, fileName: string, extension?: string): Promise<CreateFileResponse> {
    const ext = extension || 'txt';
    const fullFileName = fileName.includes('.') ? fileName : `${fileName}.${ext}`;
    const relativePath = this.storage.getRelativePath(parentPath);
    const filePath = path.join(relativePath, fullFileName).replace(/\\/g, '/');

    // Check if file already exists
    if (await this.storage.exists(filePath)) {
      return {
        success: false,
        error: `File "${fullFileName}" already exists`
      };
    }

    // Create empty file
    await this.storage.writeFile(filePath, '');

    return {
      success: true,
      filePath: this.storage.getAbsolutePath(filePath)
    };
  }

  /**
   * Create a GRAFCET file for an activated GSRSM mode
   */
  static async createModeGrafcet(request: CreateModeGrafcetRequest): Promise<CreateModeGrafcetResponse> {
    try {
      const { projectPath, modeCode } = request;
      const timestamp = new Date().toISOString();

      // Validate project path
      if (!await this.validatePath(projectPath)) {
        return {
          success: false,
          error: 'Project path does not exist'
        };
      }

      // Create mode folder if it doesn't exist
      const relativePath = this.storage.getRelativePath(projectPath);
      const modeFolderPath = path.join(relativePath, 'modes', modeCode).replace(/\\/g, '/');
      await this.storage.ensureDirectory(modeFolderPath);

      // Create file path
      const grafcetFileName = 'default.grafcet.sfc'; // Or just default.grafcet
      // User asked for "default grafcet" inside the folder. 
      // I will name it `default.sfc`
      const filePath = path.join(modeFolderPath, 'default.sfc').replace(/\\/g, '/');

      // Check if file already exists - return existing file info
      if (await this.storage.exists(filePath)) {
        const existingGrafcet = await this.storage.readJson(filePath);
        return {
          success: true,
          filePath: this.storage.getAbsolutePath(filePath),
          grafcet: existingGrafcet
        };
      }

      // Create new GRAFCET for this mode
      const grafcet: GrafcetDiagram = {
        id: uuidv4(),
        name: `${modeCode} Default Grafcet`,
        elements: [],
        version: '1.0',
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await this.storage.writeJson(filePath, grafcet);

      return {
        success: true,
        filePath: this.storage.getAbsolutePath(filePath),
        grafcet
      };
    } catch (error) {
      console.error('Error creating mode GRAFCET:', error);
      return {
        success: false,
        error: `Failed to create mode GRAFCET: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Delete a GSRSM mode folder
   */
  static async deleteModeFolder(projectPath: string, modeCode: string): Promise<boolean> {
    try {
      const relativePath = this.storage.getRelativePath(projectPath);
      const modeFolderPath = path.join(relativePath, 'modes', modeCode).replace(/\\/g, '/');

      if (await this.storage.exists(modeFolderPath)) {
        await this.storage.deleteDirectory(modeFolderPath);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error deleting mode folder:', error);
      return false;
    }
  }

  /**
   * Delete a file or folder
   */
  static async deleteItem(itemPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!await this.storage.exists(itemPath)) {
        return {
          success: false,
          error: 'Item does not exist'
        };
      }

      await this.storage.deleteDirectory(itemPath); // deleteDirectory handles both files and folders in this implementation
      return { success: true };
    } catch (error) {
      console.error('Error deleting item:', error);
      return {
        success: false,
        error: `Failed to delete item: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Rename a file or folder
   */
  static async renameItem(oldPath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
    try {
      if (!await this.storage.exists(oldPath)) {
        return {
          success: false,
          error: 'Source item does not exist'
        };
      }

      const parentDir = path.dirname(oldPath);
      const newPath = path.join(parentDir, newName).replace(/\\/g, '/');

      if (await this.storage.exists(newPath)) {
        return {
          success: false,
          error: 'An item with that name already exists'
        };
      }

      await this.storage.moveItem(oldPath, newPath);
      return {
        success: true,
        newPath: this.storage.getAbsolutePath(newPath)
      };
    } catch (error) {
      console.error('Error renaming item:', error);
      return {
        success: false,
        error: `Failed to rename item: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Copy a file or folder
   */
  static async copyItem(sourcePath: string, targetParentPath: string): Promise<{ success: boolean; newPath?: string; error?: string }> {
    try {
      if (!await this.storage.exists(sourcePath)) {
        return {
          success: false,
          error: 'Source item does not exist'
        };
      }

      const itemName = path.basename(sourcePath);
      let targetPath = path.join(this.storage.getRelativePath(targetParentPath), itemName).replace(/\\/g, '/');

      // If target exists, append " - Copy"
      if (await this.storage.exists(targetPath)) {
        const ext = path.extname(itemName);
        const nameWithoutExt = path.basename(itemName, ext);
        targetPath = path.join(this.storage.getRelativePath(targetParentPath), `${nameWithoutExt} - Copy${ext}`).replace(/\\/g, '/');
      }

      await this.storage.copyItem(sourcePath, targetPath);
      return {
        success: true,
        newPath: this.storage.getAbsolutePath(targetPath)
      };
    } catch (error) {
      console.error('Error copying item:', error);
      return {
        success: false,
        error: `Failed to copy item: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
