import express from 'express';
import path from 'path';
import { exec } from 'child_process';
import { getStorageService } from '../services/storageService.js';
import {
  SelectFolderResponse,
  CreateFileRequest,
  CreateFileResponse,
  CreateModeGrafcetRequest,
  CreateModeGrafcetResponse
} from '../types/index.js';
import { FileSystemService } from '../services/fileSystemService.js';

const router = express.Router();
const storage = getStorageService();

/**
 * POST /api/files/select-folder
 * Return the base storage path or a specific path
 */
router.post('/select-folder', async (req, res) => {
  try {
    const { defaultPath } = req.body;
    let folderPath = defaultPath || storage.getBasePath();

    // Validate the path exists (for custom paths)
    if (defaultPath) {
      const isValid = await FileSystemService.validatePath(defaultPath);
      if (!isValid) {
        folderPath = storage.getBasePath();
      }
    }

    res.json({
      success: true,
      folderPath
    } as SelectFolderResponse);
  } catch (error) {
    console.error('Error in select folder route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as SelectFolderResponse);
  }
});

/**
 * GET /api/files/debug-config
 * Debug endpoint to see storage configuration
 */
router.get('/debug-config', (req, res) => {
  res.json({
    success: true,
    basePath: storage.getBasePath(),
    cwd: process.cwd(),
    envStoragePath: process.env.STORAGE_PATH
  });
});

/**
 * GET /api/files/browse/*
 * Browse directories and files using Flydrive
 */
router.get('/browse/*', async (req, res) => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.userId;

    // Get the path from the URL (everything after /browse/)
    const browsePath = (req.params as any)[0] || '';
    const decodedPath = decodeURIComponent(browsePath);

    // Default to base storage path if no path provided
    let targetPath = decodedPath || '';

    // If no path provided and we have a userId, default to user home
    if (!targetPath && userId) {
      targetPath = path.join(storage.getBasePath(), 'users', userId);
      await storage.ensureDirectory(storage.getRelativePath(targetPath));
    }

    const relativePath = storage.getRelativePath(targetPath || storage.getBasePath());

    // Validate path exists
    if (!(await storage.exists(relativePath)) && relativePath !== '') {
      return res.status(404).json({
        success: false,
        error: 'Path not found'
      });
    }

    // Read directory contents
    const items = await storage.listDirectory(relativePath);
    const contents = [];

    for (const item of items) {
      try {
        if (item.name === '.keep') continue; // Skip .keep files

        const metadata = await storage.getMetadata(item.path);

        contents.push({
          name: item.name,
          path: storage.getAbsolutePath(item.path),
          isDirectory: item.isDirectory,
          size: metadata?.size || 0,
          lastModified: metadata?.lastModified?.toISOString() || new Date().toISOString()
        });
      } catch {
        // Skip items that can't be accessed
        continue;
      }
    }

    // Sort: directories first, then files, both alphabetically
    contents.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    const absolutePath = storage.getAbsolutePath(relativePath);
    const parentPath = path.dirname(absolutePath);

    res.json({
      success: true,
      path: absolutePath,
      parent: parentPath,
      contents
    });
  } catch (error) {
    console.error('Error in browse route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/files/drives
 * Get the base storage path (simplified for Flydrive)
 */
router.get('/drives', async (req, res) => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.userId;
    const basePath = storage.getBasePath();

    if (userId) {
      const userHome = path.join(basePath, 'users', userId);
      await storage.ensureDirectory(storage.getRelativePath(userHome));

      return res.json({
        success: true,
        drives: [
          {
            name: 'My Projects',
            path: userHome,
            isDirectory: true
          }
        ]
      });
    }

    res.json({
      success: true,
      drives: [{
        name: 'Storage',
        path: basePath,
        isDirectory: true
      }]
    });
  } catch (error) {
    console.error('Error in drives route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/create-folder
 * Create a new folder using Flydrive
 */
router.post('/create-folder', async (req, res) => {
  try {
    const { parentPath, folderName } = req.body;

    if (!parentPath || !folderName) {
      return res.status(400).json({
        success: false,
        error: 'Parent path and folder name are required'
      });
    }

    // Sanitize folder name
    const sanitizedName = storage.sanitizeFileName(folderName);
    const relativePath = storage.getRelativePath(parentPath);
    const newFolderPath = path.join(relativePath, sanitizedName).replace(/\\/g, '/');

    // Check if folder already exists
    if (await storage.exists(newFolderPath)) {
      return res.status(400).json({
        success: false,
        error: 'Folder already exists'
      });
    }

    // Create folder
    await storage.ensureDirectory(newFolderPath);

    res.json({
      success: true,
      folderPath: storage.getAbsolutePath(newFolderPath)
    });
  } catch (error) {
    console.error('Error in create folder route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/check-folder-empty
 * Check if a folder is empty using Flydrive
 */
router.post('/check-folder-empty', async (req, res) => {
  try {
    const { folderPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({
        success: false,
        error: 'Folder path is required'
      });
    }

    const relativePath = storage.getRelativePath(folderPath);

    // Check if folder exists
    if (!await storage.exists(relativePath)) {
      return res.json({
        success: true,
        isEmpty: true,
        message: 'Folder does not exist'
      });
    }

    // Read directory contents
    const contents = await storage.listDirectory(relativePath);

    // Filter out .keep files
    const actualContents = contents.filter(item => item.name !== '.keep');

    // Check if folder is completely empty
    if (actualContents.length === 0) {
      return res.json({
        success: true,
        isEmpty: true
      });
    }

    // Check if folder contains only empty subdirectories
    let hasContent = false;
    for (const item of actualContents) {
      if (!item.isDirectory) {
        hasContent = true;
        break;
      } else {
        // Recursively check subdirectory
        const subContents = await storage.listDirectory(item.path);
        const actualSubContents = subContents.filter(sub => sub.name !== '.keep');
        if (actualSubContents.length > 0) {
          hasContent = true;
          break;
        }
      }
    }

    res.json({
      success: true,
      isEmpty: !hasContent,
      fileCount: actualContents.length
    });
  } catch (error) {
    console.error('Error checking folder:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/files/delete-folder
 * Delete a folder and all its contents using Flydrive
 */
router.delete('/delete-folder', async (req, res) => {
  try {
    const { folderPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({
        success: false,
        error: 'Folder path is required'
      });
    }

    const relativePath = storage.getRelativePath(folderPath);

    // Check if folder exists
    if (!await storage.exists(relativePath)) {
      return res.json({
        success: true,
        message: 'Folder does not exist'
      });
    }

    // Remove the folder and all its contents
    await storage.deleteDirectory(relativePath);

    res.json({
      success: true,
      message: 'Folder deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/load-diagram
 * Load a single diagram file from storage
 */
router.post('/load-diagram', async (req, res) => {
  try {
    const { diagramPath } = req.body;

    if (!diagramPath) {
      return res.status(400).json({
        success: false,
        error: 'Diagram path is required'
      });
    }

    console.log(`[load-diagram] Path: "${diagramPath}"`);

    // Validate path exists (StorageService now handles absolute/relative transparently)
    if (!await storage.exists(diagramPath)) {
      console.warn(`[load-diagram] File NOT FOUND: "${diagramPath}"`);
      return res.status(404).json({ success: false, error: `Diagram file not found: ${diagramPath}` });
    }

    // Check file extension
    const lowerPath = diagramPath.toLowerCase();
    if (!lowerPath.endsWith('.json') && !lowerPath.endsWith('.sfc') && !lowerPath.endsWith('.gsrsm')) {
      return res.status(400).json({ success: false, error: 'Only .sfc, .gsrsm and .json diagram files are supported' });
    }

    const diagramData = await storage.readJson(diagramPath);
    console.log(`[load-diagram] Successfully loaded: "${diagramPath}"`);

    res.json({
      success: true,
      diagram: diagramData
    });
  } catch (error) {
    console.error('Error in load diagram route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/save-diagram
 * Save a single diagram file to storage
 */
router.post('/save-diagram', async (req, res) => {
  try {
    const { diagramPath, diagram } = req.body;

    if (!diagramPath) {
      return res.status(400).json({
        success: false,
        error: 'Diagram path is required'
      });
    }

    if (!diagram) {
      return res.status(400).json({
        success: false,
        error: 'Diagram data is required'
      });
    }

    // Check if it's a supported diagram file (.json or .grafcet)
    const lowerPath = diagramPath.toLowerCase();
    if (!lowerPath.endsWith('.json') && !lowerPath.endsWith('.sfc') && !lowerPath.endsWith('.gsrsm')) {
      return res.status(400).json({
        success: false,
        error: 'Only .sfc, .gsrsm and .json diagram files are supported'
      });
    }

    // Ensure the directory exists
    const dirPath = path.dirname(diagramPath);
    await storage.ensureDirectory(dirPath);

    // Add timestamp to diagram
    const timestamp = new Date().toISOString();
    const diagramWithTimestamp = {
      ...diagram,
      updatedAt: timestamp
    };

    // Write the diagram file
    try {
      await storage.writeJson(diagramPath, diagramWithTimestamp);

      res.json({
        success: true,
        savedPath: path.isAbsolute(diagramPath) ? diagramPath : storage.getAbsolutePath(diagramPath)
      });
    } catch (writeError) {
      console.error('Error writing diagram file:', writeError);
      return res.status(500).json({
        success: false,
        error: 'Failed to write diagram file'
      });
    }
  } catch (error) {
    console.error('Error in save diagram route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/open-explorer
 * Open file explorer at specified path (local file system only)
 */
router.post('/open-explorer', async (req, res) => {
  try {
    const { path: targetPath } = req.body;

    // Get absolute path
    const openPath = targetPath || storage.getBasePath();

    // Validate path exists using storage service
    const relativePath = storage.getRelativePath(openPath);
    if (!await storage.exists(relativePath)) {
      return res.status(404).json({
        success: false,
        error: 'Path not found'
      });
    }

    // Open file explorer based on platform
    let command = '';
    switch (process.platform) {
      case 'win32':
        // Use explorer command for Windows
        command = `explorer.exe "${openPath.replace(/\//g, '\\')}"`;
        break;
      case 'darwin':
        command = `open "${openPath}"`;
        break;
      case 'linux':
        command = `xdg-open "${openPath}"`;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported platform'
        });
    }

    exec(command, (error) => {
      if (error) {
        console.error('Error opening file explorer:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to open file explorer'
        });
      }

      res.json({
        success: true,
        message: 'File explorer opened successfully'
      });
    });
  } catch (error) {
    console.error('Error in open explorer route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/create-file
 * Create a new file (grafcet, gsrsm, folder, or custom)
 */
router.post('/create-file', async (req, res) => {
  try {
    const createRequest: CreateFileRequest = req.body;

    // Validate request
    if (!createRequest.parentPath || !createRequest.fileName || !createRequest.fileType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: parentPath, fileName, and fileType are required'
      } as CreateFileResponse);
    }

    // Validate file type
    const validFileTypes = ['grafcet', 'gsrsm', 'folder', 'custom'];
    if (!validFileTypes.includes(createRequest.fileType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Must be "grafcet", "gsrsm", "folder", or "custom"'
      } as CreateFileResponse);
    }

    // Create file
    const result = await FileSystemService.createFile(createRequest);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in create file route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as CreateFileResponse);
  }
});

/**
 * POST /api/files/create-mode-grafcet
 * Create a GRAFCET file when a GSRSM mode is activated
 */
router.post('/create-mode-grafcet', async (req, res) => {
  try {
    const createRequest: CreateModeGrafcetRequest = req.body;

    // Validate request
    if (!createRequest.projectPath || !createRequest.modeCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectPath and modeCode are required'
      } as CreateModeGrafcetResponse);
    }

    // Validate mode code format (A1-A7, F1-F6, D1-D3)
    const validModePattern = /^[AFD][1-7]$/;
    if (!validModePattern.test(createRequest.modeCode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mode code. Must be in format A1-A7, F1-F6, or D1-D3'
      } as CreateModeGrafcetResponse);
    }

    // Create mode GRAFCET
    const result = await FileSystemService.createModeGrafcet(createRequest);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in create mode grafcet route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as CreateModeGrafcetResponse);
  }
});

/**
 * GET /api/files/tree
 * Get hierarchical file tree structure for file explorer
 */
router.get('/tree', async (req, res) => {
  try {
    let targetPath = (req.query.path as string) || '';
    const authReq = req as any;
    const userId = authReq.user?.userId;

    // If no path provided and we have a userId, default to user home
    if (!targetPath && userId) {
      targetPath = path.join(storage.getBasePath(), 'users', userId);
      await storage.ensureDirectory(storage.getRelativePath(targetPath));
      console.log(`[/tree] Defaulting to user home: "${targetPath}"`);
    }

    console.log(`[/tree] Request received for targetPath: "${targetPath}"`);

    const relativePath = storage.resolvePath(targetPath);
    // console.log(`[/tree] targetPath: '${targetPath}', relativePath: '${relativePath}'`);

    // Check if path exists
    if (!await storage.exists(relativePath)) {
      return res.status(404).json({
        success: false,
        error: 'Path not found'
      });
    }

    // Build file tree recursively
    // Build recursive tree from flat list in one pass
    const items = await storage.listDirectory(relativePath, true);
    console.log(`[/tree] listDirectory('${relativePath}', true) returned ${items.length} items`);
    const lookup: Record<string, any> = {};
    const normalizedRootRel = relativePath.replace(/\\/g, '/').replace(/\/$/, '');

    console.log(`[/tree] normalizedRootRel: "${normalizedRootRel}"`);

    // 1. Create nodes and fill lookup table
    // We must synthesize directories because GCS listAll returning recursive objects 
    // often ONLY returns files, not the intermediate directory objects.

    // A helper to ensure a directory exists in the lookup
    const ensureDirectoryNode = (dirPathRel: string) => {
      if (!dirPathRel || dirPathRel === '.' || dirPathRel === normalizedRootRel) return;
      if (!lookup[dirPathRel]) {
        lookup[dirPathRel] = {
          name: path.basename(dirPathRel),
          path: storage.getAbsolutePath(dirPathRel),
          type: 'folder',
          children: [],
          isExpanded: false,
          _rel: dirPathRel
        };
        // Also ensure its parent exists
        const parentPath = path.dirname(dirPathRel).replace(/\\/g, '/').replace(/^\./, '');
        ensureDirectoryNode(parentPath);
      }
    };

    items.forEach(item => {
      const p = item.path.replace(/\\/g, '/');
      const parentPath = path.dirname(p).replace(/\\/g, '/').replace(/^\./, '');

      // Always ensure the parent directory of this item exists
      ensureDirectoryNode(parentPath);

      if (item.name === '.keep') return; // Skip adding the .keep file itself

      lookup[p] = {
        name: item.name,
        path: storage.getAbsolutePath(item.path),
        type: item.isDirectory ? 'folder' : 'file',
        children: item.isDirectory ? [] : undefined,
        isExpanded: false,
        _rel: p
      };
    });

    const tree: any[] = [];
    // 2. Link children to parents
    Object.values(lookup).forEach(node => {
      const p = node._rel;
      const parentPath = path.dirname(p).replace(/\\/g, '/').replace(/^\./, '');
      const isDirectChild = parentPath === normalizedRootRel || (normalizedRootRel === '' && parentPath === '');

      if (isDirectChild) {
        tree.push(node);
      } else if (lookup[parentPath]) {
        if (!lookup[parentPath].children) lookup[parentPath].children = [];
        lookup[parentPath].children.push(node);
      } else {
        // Fallback if parent still somehow missing (shouldn't happen with ensureDirectoryNode)
        tree.push(node);
      }
    });

    // 3. Sort recursively
    const sortTree = (nodes: any[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach(n => n.children && sortTree(n.children));
      return nodes;
    };

    res.json({
      success: true,
      tree: {
        name: path.basename(targetPath) || 'Root',
        path: targetPath,
        type: 'folder',
        children: sortTree(tree),
        isExpanded: true
      }
    });
  } catch (error) {
    console.error('Error in /tree route:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /api/files/delete-mode
 * Delete a mode folder when a GSRSM mode is deactivated
 */
router.delete('/delete-mode', async (req, res) => {
  try {
    const { projectPath, modeCode } = req.body;

    if (!projectPath || !modeCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectPath and modeCode are required'
      });
    }

    // Validate mode code format (A1-A7, F1-F6, D1-D3)
    const validModePattern = /^[AFD][1-7]$/;
    if (!validModePattern.test(modeCode)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mode code. Must be in format A1-A7, F1-F6, or D1-D3'
      });
    }

    const relativePath = storage.getRelativePath(projectPath);
    const modeFolderPath = path.join(relativePath, 'modes', modeCode).replace(/\\/g, '/');

    // Check if mode folder exists
    if (!await storage.exists(modeFolderPath)) {
      return res.json({
        success: true,
        message: 'Mode folder does not exist'
      });
    }

    // Delete the mode folder and all its contents
    await storage.deleteDirectory(modeFolderPath);

    res.json({
      success: true,
      message: `Mode ${modeCode} folder deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting mode folder:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/files/delete-item
 * Delete a file or folder
 */
router.delete('/delete-item', async (req, res) => {
  try {
    const { itemPath } = req.body;

    if (!itemPath) {
      return res.status(400).json({
        success: false,
        error: 'Item path is required'
      });
    }

    const result = await FileSystemService.deleteItem(itemPath);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in delete item route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/rename
 * Rename a file or folder
 */
router.post('/rename', async (req, res) => {
  try {
    const { oldPath, newName } = req.body;

    if (!oldPath || !newName) {
      return res.status(400).json({
        success: false,
        error: 'Source path and new name are required'
      });
    }

    const result = await FileSystemService.renameItem(oldPath, newName);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in rename route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/copy
 * Copy a file or folder to a target parent directory
 */
router.post('/copy', async (req, res) => {
  try {
    const { sourcePath, targetParentPath } = req.body;

    if (!sourcePath || !targetParentPath) {
      return res.status(400).json({
        success: false,
        error: 'Source path and target parent path are required'
      });
    }

    const result = await FileSystemService.copyItem(sourcePath, targetParentPath);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in copy route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/read-text
 * Read a text file and return its content
 * Supports .md, .txt, and other text-based files
 */
router.post('/read-text', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    // Read file content (StorageService now handles internal/external transparently)
    try {
      if (!await storage.exists(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      const content = await storage.readFile(filePath);

      res.json({
        success: true,
        content,
        filePath
      });
    } catch (readError) {
      console.error('Error reading text file:', readError);
      return res.status(404).json({
        success: false,
        error: `File not found or unreadable: ${filePath}`
      });
    }
  } catch (error) {
    console.error('Error reading text file:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/files/read-media
 * Read an image or video file and return as base64 data URL
 * Supports .png, .jpg, .jpeg, .gif, .webp, .mp4, .webm, .mov
 */
router.post('/read-media', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    // Determine MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg'
    };

    const mimeType = mimeTypes[ext];
    if (!mimeType) {
      return res.status(400).json({
        success: false,
        error: `Unsupported media format: ${ext}`
      });
    }

    let fileBuffer: Buffer;
    const fs = await import('fs/promises');

    try {
      // Check if file exists
      if (!await storage.exists(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

      // Read file as buffer
      // For local driver, we can use fs.readFile directly even for absolute external paths
      // If within storage, we can construct the absolute path
      const absolutePath = path.isAbsolute(filePath) ? filePath : storage.getAbsolutePath(filePath);
      fileBuffer = await fs.readFile(absolutePath);
    } catch (readError) {
      console.error('Error reading media file:', readError);
      return res.status(404).json({
        success: false,
        error: `File not found or unreadable: ${filePath}`
      });
    }

    // Convert to base64 data URL
    const base64Data = fileBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    res.json({
      success: true,
      dataUrl,
      filePath,
      mimeType
    });

  } catch (error) {
    console.error('Error reading media file:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;
