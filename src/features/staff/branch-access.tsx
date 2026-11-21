import { Checkbox } from '@/components/ui/checkbox'
import type { Tables } from '@/lib/supabase'

export function BranchAccessPicker({
  branches,
  allBranches,
  branchIds,
  onChange,
}: {
  branches: Tables<'branches'>[]
  allBranches: boolean
  branchIds: string[]
  onChange: (v: { allBranches: boolean; branchIds: string[] }) => void
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-[13px] font-medium">Branch access</legend>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={allBranches}
          onChange={(e) => onChange({ allBranches: e.target.checked, branchIds })}
        />
        All branches, including new ones
      </label>
      {!allBranches && (
        <div className="grid gap-2 rounded-md border bg-muted/50 p-3">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={branchIds.includes(b.id)}
                onChange={(e) =>
                  onChange({
                    allBranches,
                    branchIds: e.target.checked
                      ? [...branchIds, b.id]
                      : branchIds.filter((id) => id !== b.id),
                  })
                }
              />
              {b.name}
              {b.city && <span className="text-muted-foreground">· {b.city}</span>}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}
