import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rliflzofnczaysxwppxo.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_bAENX2Hhgndy_LT4UjdHYQ_YMlUEztE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)