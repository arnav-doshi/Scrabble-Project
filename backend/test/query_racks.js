require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  try {
    const gameId = process.argv[2] || 'game_1772589067058_ak9cwn0b6';
    const { data, error } = await supabase.from('player_racks').select('*').eq('game_id', gameId);
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
