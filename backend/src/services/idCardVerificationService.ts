import { createWorker } from 'tesseract.js';
import path from 'path';
import { pool } from '../db/pool';
import { sendIdCardVerificationEmail } from './emailService';

// Charusat student ID pattern: optional D + 2-digit year + 2-4 letter branch + 3-digit number
// Examples: 24IT014, D24IT014, 22CE001, D22BCA023
const STUDENT_ID_REGEX = /D?\d{2}[A-Z]{2,4}\d{3}/gi;

/**
 * Extracts text from an image file using Tesseract OCR.
 */
async function extractTextFromImage(absoluteImagePath: string): Promise<string> {
    const worker = await createWorker('eng');
    try {
        const { data: { text } } = await worker.recognize(absoluteImagePath);
        return text;
    } finally {
        await worker.terminate();
    }
}

/**
 * Finds all candidate student IDs in OCR text.
 */
function extractStudentIds(text: string): string[] {
    const matches = text.match(STUDENT_ID_REGEX) || [];
    // Normalise: strip leading D for comparison purposes
    return matches.map(m => m.toUpperCase());
}

/**
 * Given a Charusat email prefix, compute all possible ID forms to match against.
 * e.g. "24it014" → ["24IT014", "D24IT014"]
 */
function getExpectedIds(emailPrefix: string): string[] {
    const upper = emailPrefix.toUpperCase();
    // Remove leading D if present to get the bare ID
    const bare = upper.startsWith('D') ? upper.slice(1) : upper;
    return [bare, `D${bare}`];
}

/**
 * Main entry point — run after user registration.
 * Fire-and-forget: call with setImmediate(verifyIdCard, ...).
 */
export async function verifyIdCard(
    userId: number,
    relativeImagePath: string,   // e.g. "uploads/idcard-12345.jpg"
    email: string,
) {
    const domain = email.split('@')[1]?.toLowerCase();
    const emailPrefix = email.split('@')[0]?.toLowerCase();

    // Only process Charusat emails
    if (!domain?.includes('charusat')) return;

    // @charusat.ac.in → always PENDING (manual review)
    if (domain === 'charusat.ac.in') {
        await pool.query(
            `UPDATE users SET id_card_status = 'PENDING' WHERE user_id = $1`,
            [userId]
        );
        console.log(`[ID Card] User ${userId} (ac.in) → PENDING (manual review)`);
        return;
    }

    // @charusat.edu.in → run OCR and auto-verify
    if (domain === 'charusat.edu.in') {
        try {
            const absolutePath = path.resolve(process.cwd(), relativeImagePath);
            console.log(`[ID Card] Running OCR on: ${absolutePath}`);

            const rawText = await extractTextFromImage(absolutePath);
            console.log(`[ID Card] OCR text extracted (${rawText.length} chars)`);

            const foundIds = extractStudentIds(rawText);
            console.log(`[ID Card] Found IDs in card:`, foundIds);

            const expectedIds = getExpectedIds(emailPrefix!);
            console.log(`[ID Card] Expected IDs for ${email}:`, expectedIds);

            const upperRawText = rawText.toUpperCase();

            // Match logic:
            // 1. Direct match in found candidates
            // 2. Substring match in raw text
            // 3. Normalized match (O->0, I/|->1, S->5) to handle common OCR misreads
            let matched = foundIds.some(id => expectedIds.includes(id)) ||
                expectedIds.some(id => upperRawText.includes(id));

            if (!matched) {
                const normalize = (s: string) => s.replace(/O/g, '0').replace(/I/g, '1').replace(/\|/g, '1').replace(/S/g, '5');
                const normalizedRaw = normalize(upperRawText);
                const normalizedExpected = expectedIds.map(normalize);
                matched = normalizedExpected.some(p => normalizedRaw.includes(p));
                if (matched) console.log(`[ID Card] User ${userId} matched via normalization!`);
            }

            if (matched) {
                await pool.query(
                    `UPDATE users SET id_card_status = 'VERIFIED', id_card_verified_at = NOW() WHERE user_id = $1`,
                    [userId]
                );
                console.log(`[ID Card] User ${userId} → VERIFIED ✅`);

                // Notify user by email (non-fatal)
                try {
                    const userRes = await pool.query('SELECT email, full_name FROM users WHERE user_id = $1', [userId]);
                    if (userRes.rows[0]) {
                        await sendIdCardVerificationEmail(userRes.rows[0].email, {
                            name: userRes.rows[0].full_name,
                            status: 'VERIFIED',
                        });
                    }
                } catch (emailErr) {
                    console.error('[ID Card] Email notification failed (non-fatal):', emailErr);
                }
            } else {
                // OCR couldn't match → set PENDING for manual review
                await pool.query(
                    `UPDATE users SET id_card_status = 'PENDING' WHERE user_id = $1`,
                    [userId]
                );
                console.log(`[ID Card] User ${userId} → OCR mismatch, set PENDING`);
            }
        } catch (err) {
            console.error(`[ID Card] OCR failed for user ${userId}:`, err);
            // On failure, set to PENDING so admin can review
            await pool.query(
                `UPDATE users SET id_card_status = 'PENDING' WHERE user_id = $1`,
                [userId]
            ).catch(() => { });
        }
    }
}
