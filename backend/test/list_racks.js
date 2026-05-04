require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  try {
    const { data, error } = await supabase.from('player_racks').select('*');
    if (error) {
      console.error('Query error:', error);
      process.exit(1);
    }
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
