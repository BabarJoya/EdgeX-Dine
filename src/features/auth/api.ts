import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Public invitation lookup (restaurant, role, email, still valid?). */
export function useInvite(token: string | null) {
  return useQuery({
    queryKey: ['invite', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invite', { p_token: token! })
      if (error) throw error
      return data?.[0] ?? null
    },
  })
}
