import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://czjyhrhidbhtwpdcydtb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6anlocmhpZGJodHdwZGN5ZHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzU3MzgsImV4cCI6MjA5MTI1MTczOH0.IXv41TzLeOc1huCBM_iELlJkRg15BHgGu-ybNa1CL1c'
)
