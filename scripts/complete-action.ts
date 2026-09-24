import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase.rpc('complete_scrape_action', {
    p_action_id: '50bcd0a0-357f-49b7-b16a-a853469064e4',
    p_status: 'done',
    p_error_summary: null
  });
  console.log('Complete:', JSON.stringify({ data, error }, null, 2));
}

main().catch(console.error);