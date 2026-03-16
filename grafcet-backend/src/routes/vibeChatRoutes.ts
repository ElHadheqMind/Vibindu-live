import express from 'express';
import path from 'path';
import { getStorageService } from '../services/storageService.js';
import { FileSystemService } from '../services/fileSystemService.js';

const router = express.Router();
const storage = getStorageService();

// Filename for vibe chat conversations storage
const VIBE_CHAT_FILENAME = 'vibe-chat.json';

/**
 * Conversation message interface
 */
interface ConversationMessage {
    id: string;
    text: string;
    isUser: boolean;
    agent?: string;
    timestamp: string;
    isThinking?: boolean;
    isTask?: boolean;
    task?: string;
    isTool?: boolean;
    tool?: string;
    isToolCall?: boolean;
    toolName?: string;
    toolParams?: Record<string, unknown>;
    isToolResult?: boolean;
    toolResult?: Record<string, unknown>;
}

/**
 * Conversation interface
 */
interface Conversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: ConversationMessage[];
    metadata: {
        model: string;
        mode: string;
        thinkingLevel: number;
    };
}

/**
 * Conversations file structure
 */
interface ConversationsData {
    version: string;
    conversations: Conversation[];
    activeConversationId: string | null;
    updatedAt: string;
}

/**
 * POST /api/vibe/save
 * Save vibe chat conversations to a JSON file in the project directory
 */
router.post('/save', async (req, res) => {
    try {
        const { projectPath, conversations, activeConversationId } = req.body;

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'Project path is required'
            });
        }

        // Validate project path exists
        const isValidPath = await FileSystemService.validatePath(projectPath);
        if (!isValidPath) {
            return res.status(404).json({
                success: false,
                error: 'Project path not found'
            });
        }

        const relativePath = storage.getRelativePath(projectPath);
        const vibeChatFilePath = path.join(relativePath, VIBE_CHAT_FILENAME).replace(/\\/g, '/');

        // Build data to save
        const dataToSave: ConversationsData = {
            version: '1.0.0',
            conversations: conversations || [],
            activeConversationId: activeConversationId || null,
            updatedAt: new Date().toISOString()
        };

        // Write file
        await storage.writeJson(vibeChatFilePath, dataToSave);

        console.log(`[VibeChatRoutes] Saved ${conversations?.length || 0} conversations to ${vibeChatFilePath}`);

        res.json({
            success: true,
            savedPath: storage.getAbsolutePath(vibeChatFilePath),
            conversationCount: conversations?.length || 0
        });
    } catch (error) {
        console.error('Error saving vibe chat:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/vibe/load
 * Load vibe chat conversations from the project directory
 */
router.post('/load', async (req, res) => {
    try {
        const { projectPath } = req.body;

        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'Project path is required'
            });
        }

        const relativePath = storage.getRelativePath(projectPath);
        const vibeChatFilePath = path.join(relativePath, VIBE_CHAT_FILENAME).replace(/\\/g, '/');

        // Check if file exists
        if (!await storage.exists(vibeChatFilePath)) {
            // It's okay if it doesn't exist, return empty data
            return res.json({
                success: true,
                data: null
            });
        }

        // Read file
        const data = await storage.readJson<ConversationsData>(vibeChatFilePath);

        console.log(`[VibeChatRoutes] Loaded ${data.conversations?.length || 0} conversations from ${vibeChatFilePath}`);

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error loading vibe chat:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/vibe/storytell
 * Trigger the Python StoryProjectteller agent via HTTP (Runs on port 3005)
 */
router.post('/storytell', async (req, res) => {
    try {
        const { prompt, spec_content, projectPath } = req.body;
        
        // Use the aggregated service URL in Cloud Run
        const AGENTS_SERVICE_URL = process.env.AGENTS_SERVICE_URL || 'http://127.0.0.1:8000';
        const storytellerUrl = `${AGENTS_SERVICE_URL}/storyteller/storytell`;

        console.log(`[VibeChatRoutes] Triggering storyteller HTTP API: ${storytellerUrl}`);

        // Make HTTP request to the consolidated service (mounted at /storyteller)
        const response = await fetch(storytellerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, spec_content, projectPath })
        });

        if (!response.ok) {
            throw new Error(`Storyteller API responded with status: ${response.status}`);
        }

        const resultJson = await response.json() as any;

        if (resultJson.error || resultJson.success === false) {
            return res.status(500).json({
                success: false,
                error: resultJson.error || 'Storyteller agent returned failure'
            });
        }

        // Persist the generated Story HTML to the StorageService (Cloud Storage / Local)
        if (projectPath && resultJson.data && resultJson.data.story) {
            try {
                const relativePath = storage.getRelativePath(projectPath);
                const storyDir = path.join(relativePath, 'StoryExperience').replace(/\\/g, '/');
                await storage.ensureDirectory(storyDir);
                
                const storyFileName = resultJson.data.filename || 'Story.html';
                const storyPath = path.join(storyDir, storyFileName).replace(/\\/g, '/');
                
                await storage.writeFile(storyPath, resultJson.data.story);
                console.log(`[VibeChatRoutes] Successfully persisted Story to StorageService: ${storyPath}`);

                // Broadcast project reload to trigger frontend refresh
                try {
                    const broadcastUrl = `${AGENTS_SERVICE_URL}/api/broadcast`;
                    await fetch(broadcastUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payload: { type: 'project_reload', text: 'Story assets updated' } })
                    });
                    console.log(`[VibeChatRoutes] 📡 Broadcasted project_reload to ${broadcastUrl}`);
                } catch (bErr) {
                    console.error('[VibeChatRoutes] Failed to broadcast project_reload', bErr);
                }
            } catch (err) {
                console.error('[VibeChatRoutes] Failed to persist story to StorageService', err);
            }
        }

        res.json({
            success: resultJson.success !== undefined ? resultJson.success : true,
            message: resultJson.message || 'Story generated successfully',
            data: resultJson.data || resultJson
        });

    } catch (error: any) {
        console.error('Error triggering storytell API:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error?.message || String(error)
        });
    }
});

/**
 * POST /api/vibe/persist-story
 * Persist story files through StorageService (supports GCS + local).
 * Called by the Python agents after story generation to ensure files
 * are written through the storage abstraction layer (not direct filesystem).
 */
router.post('/persist-story', async (req, res) => {
    try {
        const { projectPath, storyHtml, filename, assets } = req.body;

        if (!projectPath || (!storyHtml && (!assets || assets.length === 0))) {
            return res.status(400).json({
                success: false,
                error: 'projectPath is required, and either storyHtml or assets must be provided'
            });
        }

        const storyFileName = filename || 'Story.html';
        const relativePath = storage.getRelativePath(projectPath);
        const storyDir = path.join(relativePath, 'StoryExperience').replace(/\\/g, '/');

        console.log(`[persist-story] Ensuring directory: ${storyDir}`);
        await storage.ensureDirectory(storyDir);

        const storyPath = path.join(storyDir, storyFileName).replace(/\\/g, '/');
        await storage.writeFile(storyPath, storyHtml);
        console.log(`[persist-story] ✅ Successfully saved Story (${storyHtml.length} chars) to StorageService: ${storyPath}`);

        // Save additional media assets if provided
        let savedAssetsCount = 0;
        if (assets && Array.isArray(assets)) {
            for (const asset of assets) {
                if (asset.filename && asset.b64) {
                    try {
                        const assetPath = path.join(storyDir, asset.filename).replace(/\\/g, '/');
                        const buffer = Buffer.from(asset.b64, 'base64');
                        await storage.writeBinary(assetPath, buffer);
                        savedAssetsCount++;
                    } catch (e) {
                         console.error(`[persist-story] Failed to save asset ${asset.filename}:`, e);
                    }
                }
            }
            console.log(`[persist-story] ✅ Successfully saved ${savedAssetsCount} associated media assets.`);
        }

        res.json({
            success: true,
            savedPath: storage.getAbsolutePath(storyPath),
            savedAssetsCount,
            message: `Story and ${savedAssetsCount} assets persisted via StorageService: ${storyPath}`
        });

    } catch (error: any) {
        console.error('[persist-story] ❌ Error:', error);
        res.status(500).json({
            success: false,
            error: error?.message || 'Failed to persist story'
        });
    }
});

/**
 * GET /api/vibe/story-asset
 * Serve a story asset (image, video, audio, or html) from a project directory
 */
router.get('/story-asset', async (req, res) => {
    try {
        const { projectPath, assetPath } = req.query;

        if (!projectPath || !assetPath) {
            return res.status(400).json({
                success: false,
                error: 'projectPath and assetPath are required'
            });
        }

        const fullPath = path.join(projectPath as string, assetPath as string).replace(/\\/g, '/');
        
        // Validate path
        if (!await storage.exists(fullPath)) {
            return res.status(404).json({
                success: false,
                error: 'Asset not found'
            });
        }

        // Determine content type
        const ext = path.extname(fullPath).toLowerCase();
        let contentType = 'application/octet-stream';
        
        if (ext === '.html') contentType = 'text/html';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.mp3') contentType = 'audio/mpeg';
        else if (ext === '.mp4') contentType = 'video/mp4';

        // Read and serve file
        const absolutePath = storage.getAbsolutePath(fullPath);
        res.setHeader('Content-Type', contentType);
        res.sendFile(absolutePath);

    } catch (error) {
        console.error('Error serving story asset:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

export default router;

