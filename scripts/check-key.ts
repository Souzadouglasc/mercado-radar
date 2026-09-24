import { config } from 'dotenv';
config({ path: '.env.local' });
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
console.log('Length:', key.length);
console.log('Ends with newline:', key.endsWith('\n') || key.endsWith('\r'));
console.log('Trimmed length:', key.trim().length);
console.log('Raw bytes end:', Array.from(key.slice(-10)).map(c => c.charCodeAt(0)));