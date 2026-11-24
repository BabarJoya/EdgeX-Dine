import { Package } from 'lucide-react'
import { Link } from 'react-router'
import { RequirePerm } from '@/components/require-perm'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExpensesTab } from '@/features/inventory/expenses-tab'
import { PurchasesTab } from '@/features/inventory/purchases-tab'
import { RecipesTab } from '@/features/inventory/recipes-tab'
import { StockTab } from '@/features/inventory/stock-tab'
import { SuppliersTab } from '@/features/inventory/suppliers-tab'
import { useTenantAccess } from '@/features/platform/api'
import { hasFeature } from '@/features/platform/features'
import { useTenant } from '@/features/tenant/tenant-provider'
import { ChooseBranch } from '@/pages/app/tables'

export function InventoryPage() {
  const { tenantId } = useTenant()
  const access = useTenantAccess(tenantId)
  if (access.data && !hasFeature(access.data.features, 'inventory')) {
    return (
      <>
        <PageHeader title="Inventory" />
        <EmptyState
          icon={Package}
          title="Inventory isn't in your plan"
          description="Upgrade to track stock, recipes and suppliers, see the food cost of every dish, and get a profit & loss report."
          action={
            <Button asChild>
              <Link to="/app/settings?tab=plan">See plans</Link>
            </Button>
          }
        />
      </>
    )
  }
  return (
    <RequirePerm any={['inventory.view']}>
      <Inventory />
    </RequirePerm>
  )
}

function Inventory() {
  const { branchId, branch, can } = useTenant()
  return (
    <>
      <PageHeader
        title="Inventory"
        description={`${branch?.name ?? 'Choose a branch'} · stock, purchases, recipes and costs.`}
      />
      {!branchId ? (
        <ChooseBranch what="Stock" />
      ) : (
        <Tabs defaultValue="stock">
          <TabsList>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="recipes">Recipes & costing</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            {can('inventory.manage') && <TabsTrigger value="expenses">Expenses</TabsTrigger>}
          </TabsList>
          <TabsContent value="stock">
            <StockTab />
          </TabsContent>
          <TabsContent value="purchases">
            <PurchasesTab />
          </TabsContent>
          <TabsContent value="recipes">
            <RecipesTab />
          </TabsContent>
          <TabsContent value="suppliers">
            <SuppliersTab />
          </TabsContent>
          {can('inventory.manage') && (
            <TabsContent value="expenses">
              <ExpensesTab />
            </TabsContent>
          )}
        </Tabs>
      )}
    </>
  )
}
