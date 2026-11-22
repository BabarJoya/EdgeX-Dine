import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { supabase, type Tables } from '@/lib/supabase'

type FieldSpec = {
  key: string
  label: string
  hint?: string
  secret?: boolean
  placeholder?: string
  /** On/off setting stored as 'true' / 'false' (default on). */
  toggle?: boolean
  options?: { value: string; label: string }[]
}
export type ProviderSpec = {
  provider: string
  title: string
  description: string
  /** Has sandbox/live endpoints. */
  modes?: boolean
  /** Not yet verified against the provider's sandbox by us. */
  beta?: boolean
  fields: FieldSpec[]
}

export const PROVIDERS: ProviderSpec[] = [
  {
    provider: 'jazzcash',
    title: 'JazzCash',
    description: 'Guests pay the bill link with a JazzCash wallet or card on JazzCash’s page.',
    modes: true,
    beta: true,
    fields: [
      { key: 'merchant_id', label: 'Merchant ID' },
      { key: 'password', label: 'Password', secret: true },
      { key: 'integrity_salt', label: 'Integrity salt', secret: true },
      {
        key: 'txn_type',
        label: 'Transaction type',
        hint: 'Leave empty to let the guest choose. MWALLET = wallet only, MPAY = card only.',
      },
    ],
  },
  {
    provider: 'easypaisa',
    title: 'Easypaisa',
    description: 'Guests pay with an Easypaisa account or card on Easypaisa’s checkout.',
    modes: true,
    beta: true,
    fields: [
      { key: 'store_id', label: 'Store ID' },
      { key: 'account_number', label: 'Merchant account number' },
      {
        key: 'payment_method',
        label: 'Payment method',
        hint: 'Leave empty for all, or e.g. MA_PAYMENT_METHOD (account) / CC_PAYMENT_METHOD (card).',
      },
      { key: 'hash_key', label: 'Hash key', secret: true },
      {
        key: 'username',
        label: 'API username',
        secret: true,
        hint: 'For the transaction status check.',
      },
      { key: 'password', label: 'API password', secret: true },
    ],
  },
  {
    provider: 'whatsapp',
    title: 'WhatsApp',
    description:
      'Sends receipts and “order ready” messages from your WhatsApp Business number (Meta Cloud API).',
    fields: [
      {
        key: 'phone_number_id',
        label: 'Phone number ID',
        hint: 'From Meta → WhatsApp → API setup.',
      },
      {
        key: 'access_token',
        label: 'Access token',
        secret: true,
        hint: 'A permanent system-user token.',
      },
      { key: 'receipt_template', label: 'Receipt template', placeholder: 'edgex_receipt' },
      { key: 'ready_template', label: 'Order-ready template', placeholder: 'edgex_order_ready' },
      { key: 'language', label: 'Template language', placeholder: 'en' },
      { key: 'send_receipts', label: 'Send receipts when a bill is paid', toggle: true },
      {
        key: 'send_ready',
        label: 'Tell takeaway / delivery guests when food is ready',
        toggle: true,
      },
    ],
  },
  {
    provider: 'fbr',
    title: 'Tax authority (FBR / PRA)',
    description:
      'Reports every paid bill to the tax authority and prints the fiscal invoice number and QR code on the receipt.',
    modes: true,
    beta: true,
    fields: [
      {
        key: 'authority',
        label: 'Authority',
        options: [
          { value: 'fbr', label: 'FBR (federal / Islamabad)' },
          { value: 'pra', label: 'PRA (Punjab)' },
        ],
      },
      {
        key: 'pos_id',
        label: 'POS ID',
        hint: 'Issued when you register this POS with the authority.',
      },
      { key: 'token', label: 'Access token', secret: true },
      {
        key: 'pct_code',
        label: 'PCT code',
        hint: 'From your registration (applied to every line).',
      },
      {
        key: 'endpoint',
        label: 'Endpoint (optional)',
        hint: 'Only if the authority gave you a different URL.',
        placeholder: 'https://…/api/Live/PostData',
      },
    ],
  },
  {
    provider: 'raast',
    title: 'Raast / bank transfer',
    description:
      'Shows your Raast ID and IBAN on the bill link. The cashier confirms the transfer at the till.',
    fields: [
      { key: 'raast_id', label: 'Raast ID', hint: 'Usually your registered mobile number.' },
      { key: 'iban', label: 'IBAN', placeholder: 'PK00XXXX0000000000000000' },
      { key: 'account_title', label: 'Account title' },
      { key: 'bank', label: 'Bank' },
    ],
  },
]

type Row = Tables<'tenant_integrations'>

export function useIntegrations(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['integrations', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_integrations')
        .select('*')
        .eq('tenant_id', tenantId!)
      if (error) throw error
      return data
    },
  })
}

/** Settings → Integrations. */
export function IntegrationsSettings({ specs = PROVIDERS }: { specs?: ProviderSpec[] }) {
  const { tenantId } = useTenant()
  const rows = useIntegrations(tenantId)
  if (!rows.data) return null
  return (
    <div className="grid max-w-2xl gap-4">
      {specs.map((s) => (
        <ProviderCard
          key={s.provider}
          spec={s}
          row={rows.data.find((r) => r.provider === s.provider)}
        />
      ))}
    </div>
  )
}

function ProviderCard({ spec, row }: { spec: ProviderSpec; row: Row | undefined }) {
  const { tenantId } = useTenant()
  const qc = useQueryClient()
  const settings = (row?.settings ?? {}) as Record<string, string>
  const [enabled, setEnabled] = useState(row?.enabled ?? false)
  const [mode, setMode] = useState(row?.mode ?? 'sandbox')
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      spec.fields.filter((f) => !f.secret).map((f) => [f.key, settings[f.key] ?? '']),
    ),
  )
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const saved = new Set(row?.secret_keys ?? [])

  const save = useMutation({
    mutationFn: async () => {
      const changed = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== ''))
      const { error } = await supabase.rpc('save_integration', {
        p_tenant_id: tenantId!,
        p_provider: spec.provider,
        p_enabled: enabled,
        p_mode: mode,
        p_settings: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])),
        p_secrets: Object.keys(changed).length ? changed : undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setSecrets({})
      qc.invalidateQueries({ queryKey: ['integrations', tenantId] })
      toast.success(`${spec.title} saved`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const id = (k: string) => `${spec.provider}-${k}`
  return (
    <Card aria-label={spec.title} role="region">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            {spec.title}
            {row?.enabled ? (
              <Badge variant="success">On</Badge>
            ) : (
              <Badge variant="neutral">Off</Badge>
            )}
            {spec.beta && <Badge variant="warning">Test in sandbox first</Badge>}
          </CardTitle>
          <CardDescription>{spec.description}</CardDescription>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`Use ${spec.title}`} />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {spec.modes && (
          <Field id={id('mode')} label="Environment">
            <NativeSelect id={id('mode')} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="sandbox">Sandbox (testing)</option>
              <option value="live">Live</option>
            </NativeSelect>
          </Field>
        )}
        {spec.fields
          .filter((f) => f.toggle)
          .map((f) => (
            <label
              key={f.key}
              className="flex items-center justify-between gap-3 text-sm sm:col-span-2"
            >
              {f.label}
              <Switch
                checked={values[f.key] !== 'false'}
                onCheckedChange={(v) => setValues({ ...values, [f.key]: String(v) })}
                aria-label={f.label}
              />
            </label>
          ))}
        {spec.fields
          .filter((f) => !f.toggle)
          .map((f) => (
            <Field key={f.key} id={id(f.key)} label={f.label} hint={f.hint}>
              {f.options ? (
                <NativeSelect
                  id={id(f.key)}
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : f.secret ? (
                <Input
                  id={id(f.key)}
                  type="password"
                  autoComplete="off"
                  placeholder={saved.has(f.key) ? 'Saved · leave blank to keep' : 'Not set'}
                  value={secrets[f.key] ?? ''}
                  onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                />
              ) : (
                <Input
                  id={id(f.key)}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {spec.fields.some((f) => f.secret) &&
            'Secrets are stored on the server and never shown again.'}
        </p>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Save {spec.title}
        </Button>
      </CardFooter>
    </Card>
  )
}
