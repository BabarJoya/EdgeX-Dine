import { Mail, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-provider'
import {
  useInvites,
  useMembers,
  useRevokeInvite,
  useRoles,
  type Member,
} from '@/features/staff/api'
import { InviteDialog } from '@/features/staff/invite-dialog'
import { inviteUrl } from '@/features/staff/invite-url'
import { MemberDialog } from '@/features/staff/member-dialog'
import { RolesTab } from '@/features/staff/roles-tab'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'

function TableSkeleton() {
  return (
    <Card className="space-y-3 p-5">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </Card>
  )
}

export function StaffPage() {
  return (
    <RequirePerm any={['staff.view', 'staff.manage', 'roles.manage']}>
      <StaffContent />
    </RequirePerm>
  )
}

function StaffContent() {
  const { tenantId, branches, can } = useTenant()
  const { user } = useAuth()
  const members = useMembers(tenantId)
  const roles = useRoles(tenantId)
  const canManage = can('staff.manage')
  const invites = useInvites(tenantId, canManage)
  const revoke = useRevokeInvite(tenantId)
  const [editing, setEditing] = useState<Member | null>(null)

  const branchNames = (m: Member) =>
    m.all_branches
      ? 'All branches'
      : m.member_branches
          .map((mb) => branches.find((b) => b.id === mb.branch_id)?.name)
          .filter(Boolean)
          .join(', ') || '—'

  const error = members.error ?? roles.error

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can use EdgeX at your restaurant, and what they can do."
        actions={canManage && roles.data && <InviteDialog roles={roles.data} />}
      />
      {error && (
        <Alert variant="destructive" className="mb-4">
          {errorMessage(error)}
        </Alert>
      )}

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">
            Members{members.data ? ` · ${members.data.length}` : ''}
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="invites">
              Invitations{invites.data?.length ? ` · ${invites.data.length}` : ''}
            </TabsTrigger>
          )}
          <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          {members.isPending ? (
            <TableSkeleton />
          ) : members.data?.length ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden md:table-cell">Branches</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.data.map((m) => {
                    const editable = canManage && !m.roles.is_owner && m.user_id !== user?.id
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">
                            {m.profile?.full_name || '—'}
                            {m.user_id === user?.id && (
                              <span className="font-normal text-muted-foreground"> (you)</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.profile?.email}</div>
                        </TableCell>
                        <TableCell>{m.roles.name}</TableCell>
                        <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                          {branchNames(m)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.status === 'active' ? 'success' : 'neutral'} dot>
                            {m.status === 'active' ? 'Active' : 'Suspended'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {editable && (
                            <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <EmptyState icon={Users} title="No team members yet" />
          )}
        </TabsContent>

        {canManage && (
          <TabsContent value="invites">
            {invites.isPending ? (
              <TableSkeleton />
            ) : invites.data?.length ? (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="w-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invites.data.map((i) => {
                      const expired = new Date(i.expires_at) < new Date()
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.email}</TableCell>
                          <TableCell>{i.roles?.name}</TableCell>
                          <TableCell>
                            {expired ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : (
                              <span className="text-muted-foreground">
                                {new Date(i.expires_at).toLocaleDateString()}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="space-x-1 text-right">
                            {!expired && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(inviteUrl(i.token))
                                  toast.success('Invite link copied')
                                }}
                              >
                                Copy link
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={revoke.isPending}
                              onClick={() =>
                                revoke.mutate(i.id, {
                                  onSuccess: () => toast.success('Invitation revoked'),
                                })
                              }
                            >
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <EmptyState
                icon={Mail}
                title="No pending invitations"
                description="Invite cashiers, waiters and kitchen staff with the Invite staff button."
              />
            )}
          </TabsContent>
        )}

        <TabsContent value="roles">
          {roles.data && members.data ? (
            <RolesTab roles={roles.data} members={members.data} />
          ) : (
            <TableSkeleton />
          )}
        </TabsContent>
      </Tabs>

      {editing && roles.data && (
        <MemberDialog member={editing} roles={roles.data} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
