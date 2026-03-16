import nodemailer from 'nodemailer';

// Email configuration - uses environment variables
// For production, use a proper SMTP service (SendGrid, Mailgun, AWS SES, etc.)
// For development/testing, you can use Ethereal (https://ethereal.email/) or Gmail

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '', // Use App Password for Gmail
    },
});

export interface AccessCredentials {
    name: string;
    email: string;
    username: string;
    password: string;
}

export class EmailService {
    /**
     * Send login credentials to a new user after access request approval
     */
    static async sendAccessCredentials(credentials: AccessCredentials): Promise<boolean> {
        const { name, email, username, password } = credentials;

        const mailOptions = {
            from: process.env.SMTP_FROM || '"VibIndu Team" <noreply@vibindu.com>',
            to: email,
            subject: '🎉 Your VibIndu Access Credentials',
            html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); color: white; padding: 40px 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0; opacity: 0.9; }
        .content { padding: 40px 30px; }
        .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
        .credentials-box { background: #f8f9fa; border-radius: 12px; padding: 25px; margin: 25px 0; border-left: 4px solid #1976d2; }
        .credential-item { margin: 15px 0; }
        .credential-label { font-size: 12px; text-transform: uppercase; color: #666; letter-spacing: 1px; margin-bottom: 5px; }
        .credential-value { font-size: 18px; font-weight: 600; color: #1976d2; font-family: 'Courier New', monospace; background: white; padding: 10px 15px; border-radius: 8px; border: 1px solid #e0e0e0; }
        .cta-button { display: inline-block; background: #1976d2; color: white; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
        .cta-button:hover { background: #1565c0; }
        .footer { background: #f8f9fa; padding: 25px 30px; text-align: center; color: #666; font-size: 14px; }
        .footer a { color: #1976d2; text-decoration: none; }
        .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-top: 20px; font-size: 14px; color: #856404; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to VibIndu! 🚀</h1>
            <p>The Future of Industrial Automation</p>
        </div>
        <div class="content">
            <p class="greeting">Hello ${name || 'there'},</p>
            <p>Great news! Your access request has been approved. You can now start using VibIndu - the world's first Vibe Coding platform for industrial automation.</p>
            
            <div class="credentials-box">
                <h3 style="margin-top: 0; color: #333;">Your Login Credentials</h3>
                <div class="credential-item">
                    <div class="credential-label">Username</div>
                    <div class="credential-value">${username}</div>
                </div>
                <div class="credential-item">
                    <div class="credential-label">Password</div>
                    <div class="credential-value">${password}</div>
                </div>
            </div>
            
            <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="cta-button">Login Now →</a>
            </div>
            
            <div class="warning">
                ⚠️ <strong>Important:</strong> Please keep these credentials secure and consider changing your password after your first login.
            </div>
        </div>
        <div class="footer">
            <p>Powered by <strong>Gemini 3</strong> & <strong>Agentic AI</strong></p>
            <p>© ${new Date().getFullYear()} El Hadheq Mind. All rights reserved.</p>
            <p><a href="https://www.elhadheqmind.com">www.elhadheqmind.com</a></p>
        </div>
    </div>
</body>
</html>
            `,
            text: `
Welcome to VibIndu!

Hello ${name || 'there'},

Your access request has been approved. Here are your login credentials:

Username: ${username}
Password: ${password}

Login at: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login

Please keep these credentials secure and consider changing your password after your first login.

Best regards,
The VibIndu Team
            `,
        };

        try {
            // Check if SMTP is configured
            if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
                console.log('[EMAIL] SMTP not configured. Credentials would be sent to:', email);
                console.log('[EMAIL] Username:', username);
                console.log('[EMAIL] Password:', password);
                return true; // Return true for dev mode
            }

            await transporter.sendMail(mailOptions);
            console.log(`[EMAIL] Credentials sent successfully to ${email}`);
            return true;
        } catch (error) {
            console.error('[EMAIL] Failed to send credentials:', error);
            return false;
        }
    }

    /**
     * Generate a random secure password
     */
    static generatePassword(length: number = 12): string {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    /**
     * Generate a username from email
     */
    static generateUsername(email: string, name?: string): string {
        // Try to use name first
        if (name) {
            const base = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const suffix = Math.floor(Math.random() * 1000);
            return `${base}${suffix}`;
        }
        // Fall back to email
        const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const suffix = Math.floor(Math.random() * 1000);
        return `${base}${suffix}`;
    }
}

