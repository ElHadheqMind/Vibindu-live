import { getPrisma } from './prismaService.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

export class AuthService {
    static async register(email: string, password: string, name?: string, username?: string) {
        const prisma = getPrisma();

        // Check if user exists
        const existing = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    ...(username ? [{ username }] : [])
                ]
            }
        });

        if (existing) {
            throw new Error('User already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                username,
                password: hashedPassword,
                name
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...result } = user;
        return result;
    }

    static async login(identifier: string, password: string) {
        const prisma = getPrisma();
        const trimmedIdentifier = identifier.trim();
        const trimmedPassword = password.trim();

        console.log(`[AuthService] Attempting login for: ${trimmedIdentifier}`);
        
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: trimmedIdentifier },
                    { username: trimmedIdentifier }
                ]
            }
        });

        if (!user) {
            console.warn(`[AuthService] User not found: ${trimmedIdentifier}`);
            throw new Error('Invalid credentials');
        }

        if (!user.password) {
            console.warn(`[AuthService] User has no password (Google login required): ${trimmedIdentifier}`);
            throw new Error('Please login with Google');
        }

        const valid = await bcrypt.compare(trimmedPassword, user.password);
        if (!valid) {
            console.warn(`[AuthService] Password mismatch for: ${trimmedIdentifier}`);
            // Log masked lengths for debugging hidden characters
            console.debug(`[AuthService] Debug: inputLen=${trimmedPassword.length}, storedHashLen=${user.password.length}`);
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...userWithoutPassword } = user;

        return {
            user: userWithoutPassword,
            token
        };
    }

    static async seedDefaultAccounts() {
        try {
            const prisma = getPrisma();
            
            // 1. Admin Account (User's account)
            // 1. Admin Account
            const adminEmail = 'mezzihoussem1@gmail.com';
            const adminPassword = (process.env.ADMIN_PASSWORD || 'vibindu-admin-2026').trim();
            const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
            
            await prisma.user.upsert({
                where: { email: adminEmail },
                update: { password: hashedAdminPassword },
                create: {
                    email: adminEmail,
                    username: 'admin',
                    password: hashedAdminPassword,
                    name: 'Vibindu Admin'
                }
            });
            console.log(`Admin account synced: ${adminEmail}`);

            // 2. Judge Account
            const judgeEmail = 'gemini.live.judge@gmail.com';
            const judgePassword = (process.env.JUDGE_PASSWORD || 'gemini-judge-2026').trim();
            const hashedJudgePassword = await bcrypt.hash(judgePassword, 10);
            
            await prisma.user.upsert({
                where: { email: judgeEmail },
                update: { password: hashedJudgePassword },
                create: {
                    email: judgeEmail,
                    username: 'judge',
                    password: hashedJudgePassword,
                    name: 'Gemini Live Judge'
                }
            });
            console.log(`Judge account synced: ${judgeEmail}`);

            // Optional: Remove old demo user if it exists
            await prisma.user.deleteMany({
                where: { username: 'demo' }
            }).catch(() => {});

        } catch (error) {
            console.error('Error seeding accounts:', error);
        }
    }

    static async googleLogin(idToken: string) {
        const client = new OAuth2Client(GOOGLE_CLIENT_ID);

        let payload;
        try {
            const ticket = await client.verifyIdToken({
                idToken,
                audience: GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch (error) {
            console.error('Google verify error:', error);
            // If verification fails (e.g. dev environment without real client ID), 
            // we optionally allow a bypass for specific dev tokens if needed, 
            // OR just fail. 
            throw new Error('Invalid Google Token');
        }

        if (!payload || !payload.email) throw new Error('Invalid Google Token Payload');

        const { email, name, sub: googleId } = payload;
        const prisma = getPrisma();

        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email,
                    name: name || '',
                    googleId,
                    password: null // Google users might not have a password
                }
            });
        } else if (!user.googleId) {
            // Link account
            user = await prisma.user.update({
                where: { id: user.id },
                data: { googleId }
            });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...userWithoutPassword } = user;
        return { user: userWithoutPassword, token };
    }
}

