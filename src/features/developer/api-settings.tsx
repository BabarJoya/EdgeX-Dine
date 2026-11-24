import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Plus, Send, Trash2, Webhook } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTenantAccess } from '@/features/platform/api'
import { hasFeature } from '@/features/platform/features'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const EVENTS = [
  ['order.created', 'Order created'],
  ['order.status_changed', 'Order status changed'],
  ['bill.paid', 'Bill paid'],
  ['reservation.created', 'Booking made'],
] as const

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw error
  return data as T
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never'

/** Settings → API & webhooks (Enterprise). */
export function ApiSettings() {
  const { tenantId } = useTenant()
  const access = useTenantAccess(tenantId)
  if (access.data && !hasFeature(access.data.features, 'api')) {
    return (
      <Alert variant="info" className="max-w-2xl">
        The API and webhooks are part of the Enterprise plan.{' '}
        <Link to="/app/settings?tab=plan" className="underline">
          See plans
        </Link>
      </Alert>
    )
  }
  return (
    <div className="grid max-w-3xl gap-4">
      <Keys />
      <Webhooks />
    </div>
  )
}

function Reveal({
  title,
  value,
  note,
  onClose,
}: {
  title: string
  value: string
  note: string
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{note}</DialogDescription>
        </DialogHeader>
        <code
          className="block rounded-md bg-muted p-3 font-mono text-[13px] break-all"
          data-testid="secret-value"
        >
          {value}
        </code>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(value).catch(() => undefined)
              toast.success('Copied')
            }}
          >
            <Copy /> Copy
          </Button>
          <Button onClick={onClose}>I have saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Keys() {
  const { tenantId } = useTenant()
  const qc = useQueryClient()
  const keys = useQuery({
    queryKey: ['api-keys', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, prefix, last_used_at, revoked_at, created_at')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const [name, setName] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['api-keys', tenantId] })
  const create = useMutation({
    mutationFn: () =>
      rpc<{ key: string }>('create_api_key', { p_tenant_id: tenantId, p_name: name }),
    onSuccess: (d) => (setShown(d.key), setName(''), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => rpc('revoke_api_key', { p_key_id: id }),
    onSuccess: () => (toast.success('Key revoked'), refresh()),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> API keys
        </CardTitle>
        <CardDescription>
          Read orders, menu, branches and daily sales from your own systems (accounting, BI). Send
          the key as <code className="font-mono">Authorization: Bearer …</code>. 120 requests a
          minute per key.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), create.mutate())}>
          <Input
            aria-label="Key name"
            placeholder="e.g. Accounting export"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={!name.trim() || create.isPending}>
            <Plus /> Create key
          </Button>
        </form>
        {(keys.data?.length ?? 0) > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data!.map((k) => (
                <TableRow key={k.id} className={k.revoked_at ? 'opacity-60' : undefined}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-[13px]">{k.prefix}…</TableCell>
                  <TableCell className="text-[13px]">{when(k.last_used_at)}</TableCell>
                  <TableCell className="text-right">
                    {k.revoked_at ? (
                      <Badge variant="neutral">Revoked</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => revoke.mutate(k.id)}>
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {shown && (
        <Reveal
          title="Your new API key"
          value={shown}
          note="Copy it now. For your security it is not shown again; create a new key if you lose it."
          onClose={() => setShown(null)}
        />
      )}
    </Card>
  )
}

type Delivery = {
  id: string
  endpoint_id: string
  event: string
  status: string
  attempts: number
  error: string | null
  response: string | null
  created_at: string
}

function Webhooks() {
  const { tenantId } = useTenant()
  const qc = useQueryClient()
  const endpoints = useQuery({
    queryKey: ['webhooks', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', tenantId],
    enabled: !!tenantId,
    refetchInterval: 10_000,
    queryFn: () => rpc<Delivery[]>('webhook_deliveries', { p_tenant_id: tenantId }),
  })
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['order.created', 'bill.paid'])
  const [secret, setSecret] = useState<string | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['webhooks', tenantId] })
    void qc.invalidateQueries({ queryKey: ['webhook-deliveries', tenantId] })
  }
  const useAct = <V,>(fn: (v: V) => Promise<unknown>, msg?: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => (msg && toast.success(msg), refresh()),
      onError: (e) => toast.error(errorMessage(e)),
    })
  const create = useMutation({
    mutationFn: () =>
      rpc<{ secret: string }>('create_webhook', {
        p_tenant_id: tenantId,
        p_url: url.trim(),
        p_events: events,
      }),
    onSuccess: (d) => (setSecret(d.secret), setUrl(''), refresh()),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const toggle = useAct((v: { id: string; on: boolean }) =>
    rpc('set_webhook_active', { p_endpoint_id: v.id, p_active: v.on }),
  )
  const remove = useAct(
    (id: string) => rpc('delete_webhook', { p_endpoint_id: id }),
    'Webhook removed',
  )
  const test = useAct(async (id: string) => {
    await rpc('send_test_webhook', { p_endpoint_id: id })
    await fetch('/api/notify/flush', { method: 'POST' }).catch(() => undefined)
  }, 'Test event sent')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="size-4" /> Webhooks
        </CardTitle>
        <CardDescription>
          We POST a signed JSON event to your HTTPS address when something happens. Check the
          <code className="mx-1 font-mono">EdgeX-Signature</code> header with your signing secret.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-3 rounded-md border p-3"
          onSubmit={(e) => (e.preventDefault(), create.mutate())}
        >
          <Field id="wh-url" label="Endpoint URL">
            <Input
              id="wh-url"
              placeholder="https://example.com/edgex"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">Events</legend>
            {EVENTS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={events.includes(k)}
                  onChange={(e) =>
                    setEvents(e.target.checked ? [...events, k] : events.filter((x) => x !== k))
                  }
                  aria-label={label}
                />
                {label} <code className="text-xs text-muted-foreground">{k}</code>
              </label>
            ))}
          </fieldset>
          <Button
            className="justify-self-start"
            disabled={!url.startsWith('https://') || !events.length || create.isPending}
          >
            <Plus /> Add endpoint
          </Button>
        </form>

        {(endpoints.data ?? []).map((e) => (
          <div
            key={e.id}
            className="grid gap-2 rounded-md border p-3"
            data-testid="webhook-endpoint"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[13px]">{e.url}</span>
              <div className="flex items-center gap-1">
                <Switch
                  checked={e.is_active}
                  onCheckedChange={(on) => toggle.mutate({ id: e.id, on })}
                  aria-label="Endpoint active"
                />
                <Button variant="ghost" size="sm" onClick={() => test.mutate(e.id)}>
                  <Send /> Send test
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove endpoint"
                  onClick={() => remove.mutate(e.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {e.events.map((ev) => (
                <Badge key={ev} variant="neutral">
                  {ev}
                </Badge>
              ))}
            </div>
          </div>
        ))}

        {(deliveries.data?.length ?? 0) > 0 && (
          <div>
            <div className="mb-1 text-sm font-medium">Recent deliveries</div>
            <Table>
              <TableBody>
                {deliveries.data!.slice(0, 10).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-[13px]">{d.event}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          d.status === 'sent'
                            ? 'success'
                            : d.status === 'failed'
                              ? 'destructive'
                              : 'warning'
                        }
                      >
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {d.error ?? d.response}
                    </TableCell>
                    <TableCell className="text-right text-[13px]">{when(d.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {secret && (
        <Reveal
          title="Signing secret"
          value={secret}
          note="Use it to verify the EdgeX-Signature header. It is shown only once."
          onClose={() => setSecret(null)}
        />
      )}
    </Card>
  )
}
