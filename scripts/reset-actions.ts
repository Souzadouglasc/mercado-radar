import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // Reset stuck "running" actions back to "pending"
  const { data, error } = await supabase
    .from('scrape_actions')
    .update({ status: 'pending', started_at: null, finished_at: null, updated_at: new Date().toISOString() })
    .eq('status', 'running')
    .select();
  
  console.log('Reset:', JSON.stringify({ data, error }, null, 2));
}

main().catch(console.error);