require('dotenv').config({ path: './.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  try {
    const gameId = 'game_1772587154916_bxh1au9bw';
    const payload = {
      game_id: gameId,
      username: 'manual_insert_node',
      tiles: [],
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('player_racks').insert(payload).select();
    if (error) {
      console.error('Insert error:', error);
      process.exit(1);
    }
    console.log('Insert result:', data);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
