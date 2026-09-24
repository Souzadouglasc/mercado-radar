import { config } from 'dotenv';
config({ path: '.env.local' });
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (len=' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'MISSING');