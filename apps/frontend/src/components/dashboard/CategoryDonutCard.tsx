import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryDonut } from '@inventorymdb/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { currency } from '@/lib/utils';

interface Props {
  title: string;
  subtitle: string;
  donut: CategoryDonut | undefined;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

// Maison Burger palette with warm accent tones.
const COLORS = ['#ED312E', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export function CategoryDonutCard({
  title,
  subtitle,
  donut,
  loading,
  emptyTitle = 'Aucun achat ce mois',
  emptyDescription = 'Les achats apparaîtront ici dès qu\'une facture sera enregistrée.',
}: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !donut || donut.items.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {!isEmpty && (
          <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
            {currency.format(donut!.totalValue)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} compact />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={donut!.items.slice(0, 8)}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="#0a0a0a"
                  strokeWidth={2}
                >
                  {donut!.items.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: '#FAF8F5',
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) => [currency.format(v), name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="mt-3 space-y-1.5 text-xs">
              {donut!.items.slice(0, 5).map((it, i) => (
                <li key={it.label} className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="truncate" title={it.label}>
                      {it.label}
                    </span>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {currency.format(it.value)}
                  </span>
                </li>
              ))}
              {donut!.items.length > 5 && (
                <li className="text-[10px] italic text-muted-foreground">
                  + {donut!.items.length - 5} autre{donut!.items.length - 5 > 1 ? 's' : ''}…
                </li>
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
