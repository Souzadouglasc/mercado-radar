import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase
    .from('scrape_actions')
    .select('*')
    .eq('status', 'pending')
    .limit(5);
  console.log(JSON.stringify({ data, error }, null, 2));
}

main().catch(console.error);