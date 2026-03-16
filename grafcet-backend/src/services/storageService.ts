import { Disk } from 'flydrive';
import { getStorageDisk, getBaseStoragePath, getStorageDriver } from '../config/storage.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * StorageService - A wrapper around Flydrive for file operations
 * This service abstracts all file system operations and makes it easy to switch storage providers
 */
export class StorageService {
    private disk: Disk;
    private basePath: string;

    constructor() {
        this.disk = getStorageDisk();
        this.basePath = getBaseStoragePath();
        console.log('[StorageService] Initialized with basePath:', this.basePath);
    }

    /**
     * Determine if a path is absolute (supports both Windows and Linux formats cross-platform)
     */
    private isPathAbsolute(p: string): boolean {
        if (!p) return false;
        // Normalize slashes for testing
        const normalized = p.replace(/\\/g, '/');
        // Linux/Unix absolute path (starts with /)
        if (normalized.startsWith('/')) return true;
        // Windows absolute path (starts with Drive Letter like C: or // for networks)
        if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('//')) return true;
        // Node's default path.isAbsolute(p) - might work for current platform
        return path.isAbsolute(p);
    }

    /**
     * Check if a path is within the base storage directory
     */
    private isInternalPath(filePath: string): boolean {
        if (!this.isPathAbsolute(filePath)) return true;

        const normalize = (p: string) => {
            let normalized = p.replace(/\\/g, '/');
            if (process.platform === 'win32' && normalized.match(/^[a-zA-Z]:/)) {
                normalized = normalized[0].toUpperCase() + normalized.slice(1);
            }
            return normalized;
        };

        const normalizedBase = normalize(this.basePath);
        const normalizedTarget = normalize(filePath);

        return normalizedTarget.startsWith(normalizedBase);
    }

    /**
     * Resolves a path for Flydrive
     * Ensures we always work with relative paths relative to the storage root
     */
    public resolvePath(filePath: string): string {
        if (!filePath || filePath === 'undefined' || filePath === 'null') {
            throw new Error('E_INVALID_PATH: Path is null, undefined or "undefined" string');
        }

        // If it's already a relative path, ensure it's clean and has no leading slash
        if (!this.isPathAbsolute(filePath)) {
            const sanitized = filePath.replace(/\\/g, '/').replace(/^\//, '');
            // Prevent traversal - only block if it's actually trying to go ABOVE the root
            // But we can be more specific: if it's a relative path starting with ../ and we are using local driver,
            // we might want to allow it if it was properly resolved. 
            // However, to be safe, we keep the block but only if it's truly problematic.
            if (sanitized.startsWith('..') || sanitized.includes('/../')) {
                // Special check: if it's for local driver and it's an absolute path that got misidentified, we might let it through
                // but usually, it's safer to block.
                throw new Error(`E_PATH_TRAVERSAL_DETECTED: Path "${filePath}" contains traversal segments`);
            }
            return sanitized;
        }

        // If it's absolute, check if it's within base path
        if (this.isInternalPath(filePath)) {
            return this.getRelativePath(filePath);
        }

        // If it's external, only allow it if we are using the local driver
        if (getStorageDriver() === 'local') {
            // Special case: Windows path on Linux - try to map it using getRelativePath
            if (process.platform !== 'win32' && /^[a-zA-Z]:/.test(filePath)) {
                try {
                    const mapped = this.getRelativePath(filePath);
                    if (mapped && !this.isPathAbsolute(mapped)) {
                        return mapped;
                    }
                } catch (e) {
                    // Ignore and use fallback
                }
            }
            
            // Fallback: return as-is but with forward slashes and NO COLON if on Linux
            let result = filePath.replace(/\\/g, '/');
            if (process.platform !== 'win32') {
                result = result.replace(/:/g, '_');
            }
            return result;
        }

        throw new Error('E_PATH_TRAVERSAL_DETECTED: Absolute path outside storage root is not allowed for cloud drivers');
    }

    /**
     * Write a JSON file to storage
     */
    async writeJson(filePath: string, data: any): Promise<void> {
        const content = JSON.stringify(data, null, 2);

        if (getStorageDriver() === 'local' && !this.isInternalPath(filePath) && this.isPathAbsolute(filePath)) {
            const resolved = filePath.replace(/\\/g, '/');
            await fs.promises.writeFile(resolved, content);
            return;
        }

        const resolvedPath = this.resolvePath(filePath);
        await this.disk.put(resolvedPath, content);
    }

    /**
     * Read a JSON file from storage
     */
    async readJson<T = any>(filePath: string): Promise<T> {
        if (getStorageDriver() === 'local' && !this.isInternalPath(filePath) && this.isPathAbsolute(filePath)) {
            const resolved = filePath.replace(/\\/g, '/');
            const content = await fs.promises.readFile(resolved, 'utf-8');
            return JSON.parse(content);
        }

        const resolvedPath = this.resolvePath(filePath);
        const content = await this.disk.get(resolvedPath);
        return JSON.parse(content.toString());
    }

    /**
     * Write a text file to storage
     */
    async writeFile(filePath: string, content: string | Buffer): Promise<void> {
        if (getStorageDriver() === 'local' && !this.isInternalPath(filePath) && this.isPathAbsolute(filePath)) {
            const resolved = filePath.replace(/\\/g, '/');
            await fs.promises.writeFile(resolved, content);
            return;
        }

        const resolvedPath = this.resolvePath(filePath);
        await this.disk.put(resolvedPath, content);
    }

    /**
     * Write binary data to storage
     */
    async writeBinary(filePath: string, data: Buffer): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);
        await this.disk.put(resolvedPath, data);
    }

    /**
     * Read a text file from storage
     */
    async readFile(filePath: string): Promise<string> {
        if (getStorageDriver() === 'local' && !this.isInternalPath(filePath) && this.isPathAbsolute(filePath)) {
            const resolved = filePath.replace(/\\/g, '/');
            const content = await fs.promises.readFile(resolved, 'utf-8');
            return content;
        }

        const resolvedPath = this.resolvePath(filePath);
        const content = await this.disk.get(resolvedPath);
        return content.toString();
    }

    /**
     * Check if a file or directory exists
     */
    async exists(filePath: string): Promise<boolean> {
        // Root path always exists
        if (filePath === '' || filePath === '.') return true;

        // Flydrive's Local driver disk.exists() often only works for files.
        // For directories, we need a different approach.
        try {
            const resolvedPath = this.resolvePath(filePath);
            const result = await this.disk.exists(resolvedPath);
            if (result) return true;

            // If false, it might still be a directory.
            // For Local driver, we can use the driver's info or fallback to a shallow list
            if (getStorageDriver() === 'local') {
                const absolute = this.getAbsolutePath(resolvedPath);
                return fs.existsSync(absolute);
            }

            // For cloud drivers, "directories" often don't exist unless they have children.
            // We can try to list one item.
            const listRes = await this.disk.listAll(resolvedPath);
            // Flydrive 1.3 returns an object with 'objects'
            if (listRes && listRes.objects) {
                const items = Array.from(listRes.objects);
                if (items.length > 0) return true;
            }

            // In case it's an iterable (future version or local driver quirk)
            if (listRes && typeof (listRes as any)[Symbol.asyncIterator] === 'function') {
                for await (const obj of listRes as any) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error(`[StorageService] exists error for "${filePath}":`, error);
            return false;
        }
    }

    /**
     * Delete a file or directory
     */
    async delete(filePath: string): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);
        await this.disk.delete(resolvedPath);
    }

    /**
     * Delete a file or directory and all its contents
     */
    async deleteDirectory(directoryPath: string): Promise<void> {
        try {
            const resolvedPath = this.resolvePath(directoryPath);

            // Safety check: Don't allow deleting the root directory or very short paths
            if (resolvedPath === '' || resolvedPath === '.' || resolvedPath === '/') {
                throw new Error('E_SECURITY_VIOLATION: Cannot delete root storage directory');
            }

            const absolute = this.getAbsolutePath(resolvedPath);

            // For local driver, we can use fs.rmSync for efficient recursive deletion
            if (getStorageDriver() === 'local') {
                if (fs.existsSync(absolute)) {
                    // fs.rmSync is available in Node.js 14.14.0+
                    if (typeof fs.rmSync === 'function') {
                        fs.rmSync(absolute, { recursive: true, force: true });
                    } else {
                        // Fallback for older Node versions
                        const stats = fs.statSync(absolute);
                        if (stats.isDirectory()) {
                            // Recursively remove directory
                            fs.rmdirSync(absolute, { recursive: true });
                        } else {
                            fs.unlinkSync(absolute);
                        }
                    }
                }
                return;
            }

            // For Cloud Drivers (GCS, S3, etc.)
            // First check if it's a file
            try {
                const isFile = await this.disk.exists(resolvedPath);
                if (isFile) {
                    await this.disk.delete(resolvedPath);
                    // On cloud storage, deleting a "file" might be enough if it's not a folder prefix
                }
            } catch (e) {
                // If it's not a single file, it might be a directory/prefix
            }

            // Delete everything with this prefix (recursive)
            if (getStorageDriver() === 'gcs') {
               // Fast path for GCS: Use native prefix deletion if available, or just delete by prefix manually
               try {
                   // @ts-ignore
                   const storage = this.disk.driver['storage'] || this.disk.driver['#storage'] || this.disk.driver._storage;
                   if (storage && typeof storage.bucket === 'function') {
                      const bucketName = process.env.GCS_BUCKET || 'vibindu-storage';
                      const bucket = storage.bucket(bucketName);
                      const prefixPath = resolvedPath.endsWith('/') ? resolvedPath : `${resolvedPath}/`;
                      await bucket.deleteFiles({ prefix: prefixPath, force: true });
                      return;
                   }
               } catch(ex) {
                   console.warn('[StorageService] Fast path GCS prefix deletion failed, falling back to iteration', ex);
               }
            }

            const listRes = await this.disk.listAll(resolvedPath, { recursive: true });
            const items = listRes && listRes.objects ? Array.from(listRes.objects) : [];
            
            for (const obj of items) {
                const itemObj = obj as any;
                const itemPath = itemObj.path || itemObj.key || itemObj.prefix || itemObj.name;
                if (itemPath) {
                    await this.disk.delete(itemPath);
                }
            }
            
            // In case it's an iterable (future version or local driver quirk)
            if (listRes && typeof (listRes as any)[Symbol.asyncIterator] === 'function') {
                for await (const obj of listRes as any) {
                    const itemObj = obj as any;
                    const itemPath = itemObj.path || itemObj.key || itemObj.prefix || itemObj.name;
                    if (itemPath) {
                        await this.disk.delete(itemPath);
                    }
                }
            }
        } catch (error) {
            console.error(`[StorageService] Error deleting "${directoryPath}":`, error);
            throw error;
        }
    }

    /**
     * List files in a directory
     */
    async listDirectory(directoryPath: string, recursive: boolean = false): Promise<Array<{ name: string; path: string; isDirectory: boolean; size?: number }>> {
        try {
            const resolvedPath = this.resolvePath(directoryPath);

            // For Local driver, we use fs.readdirSync directly as Flydrive's listAll
            // can be inconsistent with local subdirectories in some environments.
            if (getStorageDriver() === 'local') {
                const absolute = this.getAbsolutePath(resolvedPath);

                // Ensure the directory exists and is actually a directory
                if (!fs.existsSync(absolute)) {
                    return [];
                }

                const stats = fs.statSync(absolute);
                if (!stats.isDirectory()) {
                    return []; // Or handle as looking for a single file if needed
                }

                if (recursive) {
                    // Helper for recursive readdir
                    const getAllFiles = (dir: string, baseDir: string, allFiles: any[] = []) => {
                        const files = fs.readdirSync(dir, { withFileTypes: true });
                        for (const file of files) {
                            const fullPath = path.join(dir, file.name);
                            const relativeToStorageRoot = path.relative(this.basePath, fullPath).replace(/\\/g, '/');

                            allFiles.push({
                                name: file.name,
                                path: relativeToStorageRoot,
                                isDirectory: file.isDirectory(),
                                size: file.isFile() ? fs.statSync(fullPath).size : 0
                            });

                            if (file.isDirectory()) {
                                getAllFiles(fullPath, baseDir, allFiles);
                            }
                        }
                        return allFiles;
                    };

                    return getAllFiles(absolute, absolute);
                } else {
                    const files = fs.readdirSync(absolute, { withFileTypes: true });

                    return files.map(file => {
                        const relativeItemPath = path.join(resolvedPath, file.name).replace(/\\/g, '/');
                        const absoluteItemPath = path.join(absolute, file.name);

                        return {
                            name: file.name,
                            path: relativeItemPath,
                            isDirectory: file.isDirectory(),
                            size: file.isFile() ? fs.statSync(absoluteItemPath).size : 0
                        };
                    });
                }
            }

            // Flydrive 1.x only has listAll, which behaves non-recursively by default 
            // unless options like {recursive: true} are passed or it's implicitly supported
            // @ts-ignore
            const resultPromise = this.disk.listAll(resolvedPath, { recursive });
            let result = await resultPromise;
            
            const objects = [];

            if (result && result.objects) {
                objects.push(...Array.from(result.objects));
            } else if (Array.isArray(result)) {
                objects.push(...result);
            } else if (result && typeof (result as any)[Symbol.iterator] === 'function') {
                objects.push(...Array.from(result as any));
            } else if (result && typeof (result as any)[Symbol.asyncIterator] === 'function') {
                for await (const obj of result as any) {
                    objects.push(obj);
                }
            }

            return objects.map((obj: any) => {
                const isDir = obj.isDirectory === true || obj.type === 'directory';
                let itemPath = obj.path || obj.key || obj.prefix || '';
                
                // GCS DriveDirectory returns `prefix` with a trailing slash!
                // We MUST strip it, otherwise path.dirname() in the file tree builder mismatches keys and orphans files!
                if (isDir && itemPath.endsWith('/')) {
                    itemPath = itemPath.slice(0, -1);
                }

                return {
                    name: obj.name || path.basename(itemPath),
                    path: itemPath,
                    isDirectory: isDir,
                    size: obj.size || obj.contentLength || 0
                };
            });
        } catch (error) {
            console.error('[StorageService] Error listing directory:', error);
            return [];
        }
    }

    /**
     * Create a directory (ensuring parent directories exist)
     */
    async ensureDirectory(directoryPath: string): Promise<void> {
        if (getStorageDriver() === 'local' && !this.isInternalPath(directoryPath) && this.isPathAbsolute(directoryPath)) {
            const resolved = directoryPath.replace(/\\/g, '/');
            if (!fs.existsSync(resolved)) {
                fs.mkdirSync(resolved, { recursive: true });
            }
            return;
        }

        const resolvedPath = this.resolvePath(directoryPath);
        // In Flydrive, directories are created implicitly when files are written
        // We'll create a .keep file to ensure the directory exists
        const keepFilePath = path.join(resolvedPath, '.keep').replace(/\\/g, '/');
        await this.disk.put(keepFilePath, '');
    }

    /**
     * Copy a file or directory
     */
    async copyItem(sourcePath: string, destPath: string): Promise<void> {
        const resolvedSource = this.resolvePath(sourcePath);
        const resolvedDest = this.resolvePath(destPath);

        const isDir = (await this.getMetadata(resolvedSource)) === null;

        if (isDir) {
            const items = await this.listDirectory(resolvedSource);
            await this.ensureDirectory(resolvedDest);
            for (const item of items) {
                // Determine relative path from source root
                // For simplified copy, we iterate.
                // Note: listDirectory returns full paths relative to root usually. 
                // We need to be careful with recursion.
                // Assuming flat list or similar, but verify recursion.

                // If it is recursive listAll:
                const relativeSubPath = item.path.startsWith(resolvedSource)
                    ? item.path.substring(resolvedSource.length).replace(/^\//, '')
                    : item.name;

                await this.copyItem(
                    item.path,
                    path.join(resolvedDest, relativeSubPath).replace(/\\/g, '/')
                );
            }
        } else {
            const content = await this.disk.get(resolvedSource);
            await this.disk.put(resolvedDest, content);
        }
    }

    /**
     * Move a file or directory
     */
    async moveItem(sourcePath: string, destPath: string): Promise<void> {
        // Copy then delete is the safest generic way across drivers
        await this.copyItem(sourcePath, destPath);

        const resolvedSource = this.resolvePath(sourcePath);
        const isDir = (await this.getMetadata(resolvedSource)) === null;

        if (isDir) {
            await this.deleteDirectory(sourcePath);
        } else {
            await this.delete(sourcePath);
        }
    }

    /**
     * Get the absolute local path (for local storage driver)
     * This is useful for operations that require direct file system access
     * WARN: Use sparingly and primarily for display or legacy compatibility
     */
    getAbsolutePath(relativePath: string): string {
        return path.join(this.basePath, relativePath).replace(/\\/g, '/');
    }

    /**
     * Convert an absolute path to a relative storage path
     */
    getRelativePath(absolutePath: string): string {
        if (!absolutePath || absolutePath === 'undefined' || absolutePath === 'null') {
            throw new Error('E_INVALID_PATH: Absolute path is null or undefined string');
        }

        // Normalize both paths to use forward slashes and consistent case for the drive letter
        const normalize = (p: string) => {
            let normalized = p.replace(/\\/g, '/');
            // On Windows, handle drive letter case specifically
            if (process.platform === 'win32' && normalized.match(/^[a-zA-Z]:/)) {
                normalized = normalized[0].toUpperCase() + normalized.slice(1);
            }
            return normalized;
        };
        const normalizedBase = normalize(this.basePath);
        const normalizedTarget = normalize(absolutePath);

        // If it's already relative, just return it sanitized
        if (!this.isPathAbsolute(absolutePath)) {
            return normalizedTarget;
        }

        // Detect if our basePath is a Windows path on Linux - this is a configuration error
        // but we can try to work around it by stripping the drive letter.
        let effectiveBase = normalizedBase;
        if (process.platform !== 'win32' && /^[a-zA-Z]:/.test(normalizedBase)) {
            console.warn(`[StorageService] CRITICAL: basePath is a Windows path on Linux: ${normalizedBase}`);
            effectiveBase = normalizedBase.substring(2);
            if (!effectiveBase.startsWith('/')) effectiveBase = '/' + effectiveBase;
        }

        // Special case: Windows path on a non-Windows platform (Docker/Linux)
        if (process.platform !== 'win32' && /^[a-zA-Z]:/.test(normalizedTarget)) {
            console.log(`[StorageService] Detected Windows path on Linux: ${normalizedTarget}`);
            
            // 1. Try to find if it matches the current storage structure
            // Example: Host path C:/Users/pc/data/Project1 vs Container path /app/data
            // If they share "data" segment, we can extract the relative part.
            const baseSegments = normalizedBase.split('/').filter(Boolean);
            const lastBaseSegment = baseSegments[baseSegments.length - 1]; // e.g. "data"
            
            if (lastBaseSegment) {
                const targetSegments = normalizedTarget.split('/').filter(Boolean);
                const matchIndex = targetSegments.lastIndexOf(lastBaseSegment);
                
                if (matchIndex !== -1 && matchIndex < targetSegments.length - 1) {
                    const relativeFromMatch = targetSegments.slice(matchIndex + 1).join('/');
                    console.log(`[StorageService] Successfully mapped Windows path via segment "${lastBaseSegment}": ${relativeFromMatch}`);
                    return relativeFromMatch;
                }
            }
            
            // 2. Fallback: If no segment match, strip drive letter and try path.relative
            // This might still result in .. but it's better than a colon
            const strippedTarget = normalizedTarget.substring(2);
            const relative = path.relative(normalizedBase, strippedTarget);
            return relative.replace(/\\/g, '/').replace(/:/g, '_');
        }

        // Special case: Linux-style absolute path on Windows (often from Docker DB or frontend)
        if (process.platform === 'win32' && normalizedTarget.startsWith('/')) {
            console.log(`[StorageService] Detected Linux-style path on Windows: ${normalizedTarget}`);

            // 1. If it starts with /app/data, map it to our current base path
            // /app/data is the standard container path used in our Dockerfile
            if (normalizedTarget.startsWith('/app/data')) {
                const relativeToAppLogData = normalizedTarget.substring('/app/data'.length).replace(/^\//, '');
                console.log(`[StorageService] Mapping /app/data to basePath: ${relativeToAppLogData}`);
                return relativeToAppLogData;
            }

            // 2. Try to find if it matches the current storage structure by segment
            const baseSegments = effectiveBase.split('/').filter(Boolean);
            const lastBaseSegment = baseSegments[baseSegments.length - 1]; // e.g. "GrafcetProjects" or "data"

            if (lastBaseSegment) {
                const targetSegments = normalizedTarget.split('/').filter(Boolean);
                const matchIndex = targetSegments.lastIndexOf(lastBaseSegment);

                if (matchIndex !== -1 && matchIndex < targetSegments.length - 1) {
                    const relativeFromMatch = targetSegments.slice(matchIndex + 1).join('/');
                    console.log(`[StorageService] Successfully mapped Linux path via segment "${lastBaseSegment}": ${relativeFromMatch}`);
                    return relativeFromMatch;
                }
            }
        }

        // Use Node's path.relative to handle cross-platform logic
        const relative = path.relative(effectiveBase, normalizedTarget);
        console.log(`[StorageService] getRelativePath: Base="${effectiveBase}", Target="${normalizedTarget}", Result="${relative}"`);

        // If the relative path starts with .. it means it's outside the base path
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            // Only throw error if we are NOT on local driver OR it's truly malicious traversal
            // (on local driver, we allow absolute paths outside base but not /../ traversal)
            if (getStorageDriver() !== 'local') {
                console.warn(`[StorageService] Attempted to access path outside base storage: ${absolutePath}`);
                console.warn(`[StorageService] Base: ${normalizedBase}, Target: ${normalizedTarget}, Relative: ${relative}`);
                throw new Error('E_PATH_TRAVERSAL_DETECTED');
            }
        }

        // Convert to forward slashes for Flydrive
        return relative.replace(/\\/g, '/');
    }

    /**
     * Validate if a path is accessible
     */
    async validatePath(pathOrRelative: string): Promise<boolean> {
        try {
            return await this.exists(pathOrRelative);
        } catch {
            return false;
        }
    }

    /**
     * Sanitize a file name for cross-platform compatibility
     */
    sanitizeFileName(name: string): string {
        return name
            .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .replace(/_{2,}/g, '_') // Replace multiple underscores with single
            .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
    }

    /**
     * Generate a unique file ID
     */
    generateId(): string {
        return uuidv4();
    }

    /**
     * Get metadata about a file
     */
    async getMetadata(filePath: string): Promise<{ size: number; lastModified: Date } | null> {
        try {
            const resolvedPath = this.resolvePath(filePath);
            const stats = await this.disk.getMetaData(resolvedPath);
            return {
                size: stats.contentLength,
                lastModified: stats.lastModified
            };
        } catch {
            return null;
        }
    }

    /**
     * Get the base storage path
     */
    getBasePath(): string {
        return this.basePath;
    }
}

// Singleton instance
let storageServiceInstance: StorageService | null = null;

/**
 * Get the storage service instance (singleton)
 */
export const getStorageService = (): StorageService => {
    if (!storageServiceInstance) {
        storageServiceInstance = new StorageService();
    }
    return storageServiceInstance;
};

export default StorageService;
