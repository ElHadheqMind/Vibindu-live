/**
 * RenderService - Handles image and video generation for automation system visualization
 * 
 * Uses:
 * - Nano Banana Pro (gemini-3-pro-image-preview) for generating system diagrams from spec.md
 * - Veo 3.1 Fast (veo-3.1-fast-generate-preview) for animating the system workflow
 */

import { StorageService } from './storageService.js';
import path from 'path';

// Types for render results
export interface ImageRenderResult {
    success: boolean;
    imagePath?: string;
    imageBase64?: string;
    error?: string;
    prompt?: string;
}

export interface VideoRenderResult {
    success: boolean;
    videoPath?: string;
    operationName?: string;
    status: 'pending' | 'generating' | 'complete' | 'error';
    error?: string;
    prompt?: string;
}

export class RenderService {
    private storage: StorageService;
    private apiKey: string;
    private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    // Retry configuration
    private maxRetries = 3;
    private retryDelayMs = 2000;
    // Try multiple image models in order until one works
    // Includes Gemini models and Imagen 4 variants
    private imageModels = [
        'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image-preview',
        'imagen-4.0-fast-generate-001'
    ];

    constructor() {
        this.storage = new StorageService();
        this.apiKey = process.env.GEMINI_API_KEY || '';
        if (!this.apiKey) {
            console.warn('[RenderService] GEMINI_API_KEY not set');
        }
    }

    /**
     * Helper to delay execution (for retry backoff)
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate a system diagram image from spec.md
     * Tries multiple image models, with retry logic (3 attempts per model)
     */
    async generateSystemImage(projectPath: string, customPrompt?: string): Promise<ImageRenderResult> {
        try {
            // 1. Read spec.md from project
            const specContent = await this.readSpecFile(projectPath);
            if (!specContent) {
                return { success: false, error: 'spec.md not found in project' };
            }

            // 2. Build the image generation prompt
            const prompt = customPrompt || this.buildImagePrompt(specContent);

            const allErrors: string[] = [];

            // 3. Try each image model until one works
            for (const modelId of this.imageModels) {
                console.log(`[RenderService] Trying image model: ${modelId}`);

                // Retry up to maxRetries times for each model
                for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                    console.log(`[RenderService] ${modelId} - Attempt ${attempt}/${this.maxRetries}`);

                    const result = await this.tryGenerateImage(modelId, prompt, projectPath);
                    if (result.success) {
                        console.log(`[RenderService] ✅ ${modelId} succeeded on attempt ${attempt}`);
                        return result;
                    }

                    // Log failure
                    const errorMsg = `${modelId} attempt ${attempt}: ${result.error}`;
                    console.log(`[RenderService] ❌ ${errorMsg}`);
                    allErrors.push(errorMsg);

                    // For quota/permission errors, skip to next model immediately (no retry)
                    if (result.error?.includes('quota') || result.error?.includes('permission') ||
                        result.error?.includes('401') || result.error?.includes('403')) {
                        console.log(`[RenderService] ${modelId} - Skipping retries due to auth/quota error`);
                        break;
                    }

                    // For 404 (model not found), skip to next model immediately
                    if (result.error?.includes('404') || result.error?.includes('not found')) {
                        console.log(`[RenderService] ${modelId} - Model not available, trying next`);
                        break;
                    }

                    // Wait before retry (exponential backoff)
                    if (attempt < this.maxRetries) {
                        const backoffMs = this.retryDelayMs * Math.pow(2, attempt - 1);
                        console.log(`[RenderService] Waiting ${backoffMs}ms before retry...`);
                        await this.delay(backoffMs);
                    }
                }
            }

            // All models and retries exhausted
            const errorSummary = `All image models failed after ${this.maxRetries} attempts each.\n\nErrors:\n${allErrors.slice(-5).join('\n')}`;
            console.error('[RenderService] ' + errorSummary);
            return { success: false, error: errorSummary, prompt };

        } catch (error: any) {
            console.error('[RenderService] Image generation error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Try generating an image with a specific model
     */
    private async tryGenerateImage(modelId: string, prompt: string, projectPath: string): Promise<ImageRenderResult> {
        try {
            let response: Response;
            let data: any;

            if (modelId.startsWith('gemini')) {
                // Gemini model (generateContent API)
                response = await fetch(`${this.baseUrl}/models/${modelId}:generateContent`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': this.apiKey
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseModalities: ['IMAGE', 'TEXT'],
                            imageSafetySettings: { safetyFilterLevel: 'BLOCK_NONE' }
                        }
                    }),
                    signal: AbortSignal.timeout(90000) // 90 second timeout
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    return { success: false, error: `API Error (${response.status}): ${errorText}`, prompt };
                }

                data = await response.json() as any;

                // Extract image from Gemini response
                const imageParts = data.candidates?.[0]?.content?.parts?.filter(
                    (p: any) => p.inlineData
                ) || [];

                if (imageParts.length === 0) {
                    return { success: false, error: 'No image in response', prompt };
                }

                const imageBase64 = imageParts[0].inlineData.data;
                const mimeType = imageParts[0].inlineData.mimeType || 'image/png';
                const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';

                return await this.saveGeneratedImage(imageBase64, projectPath, prompt, ext);

            } else if (modelId.startsWith('imagen')) {
                // Imagen model (predict API)
                response = await fetch(`${this.baseUrl}/models/${modelId}:predict`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': this.apiKey
                    },
                    body: JSON.stringify({
                        instances: [{ prompt: prompt }],
                        parameters: {
                            sampleCount: 1,
                            aspectRatio: '16:9',
                            personGeneration: 'DONT_ALLOW'
                        }
                    }),
                    signal: AbortSignal.timeout(90000) // 90 second timeout
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    return { success: false, error: `API Error (${response.status}): ${errorText}`, prompt };
                }

                data = await response.json() as any;

                // Extract image from Imagen response
                const predictions = data.predictions || [];
                if (predictions.length === 0 || !predictions[0].bytesBase64Encoded) {
                    return { success: false, error: 'No image in Imagen response', prompt };
                }

                const imageBase64 = predictions[0].bytesBase64Encoded;
                return await this.saveGeneratedImage(imageBase64, projectPath, prompt, 'png');
            }

            return { success: false, error: `Unknown model type: ${modelId}`, prompt };

        } catch (error: any) {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                return { success: false, error: 'Request timed out', prompt };
            }
            return { success: false, error: error.message, prompt };
        }
    }

    /**
     * Save generated image to project folder
     */
    private async saveGeneratedImage(imageBase64: string, projectPath: string, prompt: string, ext: string): Promise<ImageRenderResult> {
        const imageName = `system_diagram_${Date.now()}.${ext}`;
        const imagePath = path.join(projectPath, 'renders', imageName).replace(/\\/g, '/');

        // Ensure renders directory exists
        const fs = await import('fs/promises');
        const rendersDir = path.resolve(process.cwd(), '..', projectPath, 'renders');
        try {
            await fs.mkdir(rendersDir, { recursive: true });
        } catch { }

        // Save to filesystem directly (more reliable)
        const fullPath = path.resolve(process.cwd(), '..', projectPath, 'renders', imageName);
        await fs.writeFile(fullPath, Buffer.from(imageBase64, 'base64'));
        console.log(`[RenderService] Image saved to: ${fullPath}`);

        return {
            success: true,
            imagePath: fullPath,
            imageBase64: imageBase64,
            prompt
        };
    }

    /**
     * Build an image generation prompt from spec content
     */
    private buildImagePrompt(specContent: string): string {
        return `Generate a photorealistic 3D render of an industrial automation system in a modern factory setting.

Based on this technical specification:
${specContent.slice(0, 4000)}

Create a highly realistic image showing:
1. Real industrial sensors (proximity sensors with metal housings, photoelectric sensors with LED indicators, inductive sensors)
2. Real actuators (servo motors, pneumatic cylinders, solenoid valves with tubing)
3. Conveyor belts with metal frames and rubber belts
4. Industrial control panel with push buttons, indicator lights, and emergency stop
5. Cable trays, pneumatic tubing, and proper industrial wiring
6. Products/parts being processed on the conveyor system

Style: Photorealistic 3D render, as if photographed in a real factory
Lighting: Industrial LED lighting from above, realistic shadows
Environment: Clean modern factory floor with safety markings
Camera angle: Isometric view showing the complete system layout
Quality: High detail on sensors, motors, and mechanical components

if spec in frensh all output should be in frensh
if english output english`;
    }

    /**
     * Generate an animation video of the system using Veo 3.1
     * Uses image-to-video if system image exists, otherwise text-to-video
     */
    async generateSystemVideo(
        projectPath: string,
        imageBase64?: string,
        customPrompt?: string
    ): Promise<VideoRenderResult> {
        try {
            // 1. Read spec.md from project
            const specContent = await this.readSpecFile(projectPath);
            if (!specContent && !customPrompt) {
                return { success: false, status: 'error', error: 'spec.md not found in project' };
            }

            // 2. Build the video generation prompt
            const prompt = customPrompt || this.buildVideoPrompt(specContent || '');

            // 3. Build request body - with or without reference image
            const requestBody: any = {
                instances: [{
                    prompt: prompt
                }],
                parameters: {
                    aspectRatio: '16:9',
                    durationSeconds: 8,
                    resolution: '720p'
                }
            };

            // If we have an image, use it as reference
            if (imageBase64) {
                requestBody.instances[0].image = {
                    bytesBase64Encoded: imageBase64
                };
            }

            // 4. Call Veo 3.1 Fast API (long-running operation)
            const response = await fetch(`${this.baseUrl}/models/veo-3.1-fast-generate-preview:predictLongRunning`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, status: 'error', error: `API Error: ${errorText}`, prompt };
            }

            const data = await response.json() as any;
            const operationName = data.name;

            console.log('[RenderService] Veo 3.1 operation started:', operationName);

            return {
                success: true,
                status: 'generating',
                operationName,
                prompt
            };

        } catch (error: any) {
            console.error('[RenderService] Video generation error:', error);
            return { success: false, status: 'error', error: error.message };
        }
    }

    /**
     * Check the status of a Veo 3.1 video generation operation
     */
    async checkVideoStatus(operationName: string): Promise<VideoRenderResult> {
        try {
            const response = await fetch(`${this.baseUrl}/${operationName}`, {
                method: 'GET',
                headers: {
                    'x-goog-api-key': this.apiKey
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, status: 'error', error: `API Error: ${errorText}` };
            }

            const data = await response.json() as any;

            if (data.done) {
                // Video is ready - extract the URI
                const videoUri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;

                return {
                    success: true,
                    status: 'complete',
                    videoPath: videoUri,
                    operationName
                };
            }

            return {
                success: true,
                status: 'generating',
                operationName
            };

        } catch (error: any) {
            console.error('[RenderService] Check status error:', error);
            return { success: false, status: 'error', error: error.message };
        }
    }

    /**
     * Download the generated video and save to project
     */
    async downloadVideo(videoUri: string, projectPath: string): Promise<VideoRenderResult> {
        try {
            const response = await fetch(videoUri, {
                headers: {
                    'x-goog-api-key': this.apiKey
                }
            });

            if (!response.ok) {
                return { success: false, status: 'error', error: 'Failed to download video' };
            }

            const videoBuffer = Buffer.from(await response.arrayBuffer());
            const videoName = `system_animation_${Date.now()}.mp4`;
            const videoPath = path.join(projectPath, 'renders', videoName).replace(/\\/g, '/');

            await this.storage.writeBinary(
                this.storage.getRelativePath(videoPath),
                videoBuffer
            );

            return {
                success: true,
                status: 'complete',
                videoPath
            };

        } catch (error: any) {
            console.error('[RenderService] Download video error:', error);
            return { success: false, status: 'error', error: error.message };
        }
    }

    /**
     * Build a video generation prompt from spec content
     */
    private buildVideoPrompt(specContent: string): string {
        return `Animate this industrial automation system showing realistic operation in a factory.

Based on this specification:
${specContent.slice(0, 2000)}

Animate the following realistic sequence:
1. System powers on - indicator lights illuminate, control panel displays activate
2. Conveyor belt starts moving smoothly with realistic belt motion
3. Products (boxes/parts) enter the system and move along the conveyor
4. Sensors detect products - LED indicators blink when triggered
5. Pneumatic cylinders extend/retract to sort or process items
6. Motors spin with realistic rotation, gears mesh properly
7. Products exit the system after processing

Visual style: Photorealistic factory environment, industrial lighting
Motion: Smooth mechanical movements, realistic physics
Sound: Factory ambience - conveyor hum, pneumatic hiss, motor whir, sensor beeps
Camera: Slight slow pan to show the complete system in operation

if spec in frensh all output should be in frensh
if english output english`;
    }

    /**
     * Read spec.md file from project
     * Tries multiple locations: storage path, workspace path, absolute path
     */
    private async readSpecFile(projectPath: string): Promise<string | null> {
        const fs = await import('fs/promises');
        const possiblePaths = [
            // Try as relative to storage
            path.join(projectPath, 'spec.md'),
            // Try as relative to workspace (cwd)
            path.resolve(process.cwd(), projectPath, 'spec.md'),
            // Try as relative to parent of cwd (for monorepo structure)
            path.resolve(process.cwd(), '..', projectPath, 'spec.md'),
            // Try as absolute path
            path.isAbsolute(projectPath) ? path.join(projectPath, 'spec.md') : null
        ].filter(Boolean) as string[];

        for (const specPath of possiblePaths) {
            try {
                const content = await fs.readFile(specPath, 'utf-8');
                console.log('[RenderService] Found spec.md at:', specPath);
                return content;
            } catch {
                // Try next path
            }
        }

        // Also try via storage service
        try {
            const specPath = path.join(projectPath, 'spec.md').replace(/\\/g, '/');
            const relativePath = this.storage.getRelativePath(specPath);
            const content = await this.storage.readFile(relativePath);
            return content;
        } catch {
            // Not found
        }

        console.log('[RenderService] spec.md not found in any location for:', projectPath);
        return null;
    }
}

// Singleton instance
export const renderService = new RenderService();

