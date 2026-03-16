import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { GCSDriver } from 'flydrive/drivers/gcs';
import path from 'path';
import os from 'os';

/**
 * Storage configuration for Flydrive
 * Supports local file system and Google Cloud Storage
 * Set STORAGE_DRIVER environment variable to switch between providers
 */

// Get the base storage path from environment or use default
const getStoragePath = (): string => {
    // Check for STORAGE_PATH environment variable
    let envPath = process.env.STORAGE_PATH;

    // Detect if we are on Linux/Docker but the provided path looks like a Windows path (e.g. from a copied .env file)
    if (envPath && process.platform !== 'win32' && /^[a-zA-Z]:/.test(envPath)) {
        console.warn(`[StorageConfig] Detected Windows STORAGE_PATH on Linux: "${envPath}". Ignoring and using default.`);
        envPath = undefined;
    }

    if (envPath) {
        return envPath;
    }

    // Default to Documents/GrafcetProjects folder
    const documentsPath = path.join(os.homedir(), 'Documents', 'GrafcetProjects');
    return documentsPath;
};

/**
 * Storage driver type configuration
 * - 'local': Local file system (for development)
 * - 'gcs': Google Cloud Storage (for Cloud Run production)
 * - 's3': AWS S3 (not yet implemented)
 */
export type StorageDriver = 'local' | 'gcs' | 's3';

const CURRENT_DRIVER: StorageDriver = (process.env.STORAGE_DRIVER as StorageDriver) || 'local';

/**
 * Create and configure the storage disk based on the current driver
 */
export const createStorageDisk = (): Disk => {
    switch (CURRENT_DRIVER) {
        case 'local':
            return createLocalDisk();
        case 'gcs':
            return createGCSDisk();
        case 's3':
            throw new Error('S3 driver not yet implemented. Use GCS for cloud storage.');
        default:
            return createLocalDisk();
    }
};

/**
 * Create a local file system disk
 */
const createLocalDisk = (): Disk => {
    const storagePath = getStoragePath();

    const fsDriver = new FSDriver({
        location: storagePath,
        visibility: 'private' as const,
    });

    return new Disk(fsDriver);
};

/**
 * Create a Google Cloud Storage disk
 * Required environment variables:
 * - GCS_BUCKET: The GCS bucket name
 * - GCS_PROJECT_ID: The Google Cloud project ID (optional if using service account)
 * - GCS_KEY_FILE: Path to service account JSON key file (optional)
 * - GCS_CREDENTIALS: JSON string of service account credentials (alternative to GCS_KEY_FILE)
 */
const createGCSDisk = (): Disk => {
    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
        throw new Error('GCS_BUCKET environment variable is required for GCS storage driver');
    }

    // Build GCS driver options
    const gcsOptions: any = {
        bucket,
        visibility: 'private' as const,
        usingUniformAcl: true, // Recommended for Cloud Run
    };

    // Add project ID if provided
    if (process.env.GCS_PROJECT_ID) {
        gcsOptions.projectId = process.env.GCS_PROJECT_ID;
    }

    // Use credentials from environment variable (JSON string) or key file path
    if (process.env.GCS_CREDENTIALS) {
        try {
            gcsOptions.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
        } catch (e) {
            throw new Error('GCS_CREDENTIALS must be a valid JSON string');
        }
    } else if (process.env.GCS_KEY_FILE) {
        gcsOptions.keyFilename = process.env.GCS_KEY_FILE;
    }
    // If neither is provided, GCS will use Application Default Credentials (ADC)
    // This works automatically in Cloud Run with the service account attached to the service

    console.log('[StorageService] Using GCS storage driver with bucket:', bucket);

    const gcsDriver = new GCSDriver(gcsOptions);
    return new Disk(gcsDriver);
};

/**
 * Singleton instance of the storage disk
 */
let diskInstance: Disk | null = null;

/**
 * Get the storage disk instance (singleton)
 */
export const getStorageDisk = (): Disk => {
    if (!diskInstance) {
        diskInstance = createStorageDisk();
    }
    return diskInstance;
};

/**
 * Get the current storage driver type
 */
export const getStorageDriver = (): StorageDriver => {
    return CURRENT_DRIVER;
};

/**
 * Get the base storage path
 */
export const getBaseStoragePath = (): string => {
    return getStoragePath();
};

export default getStorageDisk;
