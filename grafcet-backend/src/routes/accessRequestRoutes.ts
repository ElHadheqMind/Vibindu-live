import express from 'express';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../services/prismaService.js';
import { EmailService } from '../services/emailService.js';

const router = express.Router();

/**
 * POST /api/access-request
 * Handle new access requests:
 * 1. Check if email already exists
 * 2. Generate username and password
 * 3. Create user in database
 * 4. Save access request record
 * 5. Send credentials via email
 */
router.post('/', async (req, res) => {
    try {
        const { name, email, profession, company } = req.body;

        // Validate required fields
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        const prisma = getPrisma();

        // Check if email already exists in users
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'An account with this email already exists. Please login instead.'
            });
        }

        // Check if there's already a pending/approved access request
        const existingRequest = await prisma.accessRequest.findUnique({
            where: { email }
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                error: 'An access request for this email already exists. Please check your email for credentials.'
            });
        }

        // Generate credentials
        const username = EmailService.generateUsername(email, name);
        const plainPassword = EmailService.generatePassword(12);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Ensure username is unique
        let finalUsername = username;
        let usernameExists = await prisma.user.findUnique({ where: { username: finalUsername } });
        let attempts = 0;
        while (usernameExists && attempts < 10) {
            finalUsername = `${username}${Math.floor(Math.random() * 10000)}`;
            usernameExists = await prisma.user.findUnique({ where: { username: finalUsername } });
            attempts++;
        }

        // Create user with auto-generated credentials
        const user = await prisma.user.create({
            data: {
                email,
                username: finalUsername,
                password: hashedPassword,
                name,
                vibeAccess: true // Auto-grant vibe access
            }
        });

        // Save access request record (with plain password for reference)
        await prisma.accessRequest.create({
            data: {
                name,
                email,
                profession: profession || null,
                company: company || null,
                username: finalUsername,
                password: plainPassword, // Store plain for admin reference
                status: 'approved',
                userId: user.id
            }
        });

        // Send credentials via email
        const emailSent = await EmailService.sendAccessCredentials({
            name,
            email,
            username: finalUsername,
            password: plainPassword
        });

        console.log(`[ACCESS REQUEST] New user created: ${email} (username: ${finalUsername})`);

        res.status(201).json({
            success: true,
            message: 'Access granted! Check your email for login credentials.',
            emailSent,
            // Only return username in response (not password for security)
            data: {
                username: finalUsername,
                email
            }
        });

    } catch (error: any) {
        console.error('[ACCESS REQUEST] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process access request',
            message: error.message
        });
    }
});

/**
 * GET /api/access-request/check/:email
 * Check if an email already has an account or pending request
 */
router.get('/check/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const prisma = getPrisma();

        const existingUser = await prisma.user.findUnique({ where: { email } });
        const existingRequest = await prisma.accessRequest.findUnique({ where: { email } });

        res.json({
            success: true,
            exists: !!(existingUser || existingRequest),
            hasAccount: !!existingUser,
            hasRequest: !!existingRequest
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

