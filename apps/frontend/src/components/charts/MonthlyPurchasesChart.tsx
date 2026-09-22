import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MonthlyPurchasesPoint } from '@inventorymdb/shared';

interface Props {
  data: MonthlyPurchasesPoint[];
}

/** Compact CAD axis tick formatter — keeps the Y-axis narrow for big amounts. */
const axisCadCompact = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const tooltipCad = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
});

export function MonthlyPurchasesChart({ data }: Props) {
  const formatted = data.map((d) => ({
    label: `${String(d.month).padStart(2, '0')}/${d.year}`,
    total: d.totalAmount,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#A0A0A0" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#A0A0A0"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v: number) => axisCadCompact.format(v)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(237,49,46,0.08)' }}
          contentStyle={{
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            color: '#FAF8F5',
            fontSize: 12,
          }}
          formatter={(v: number) => [tooltipCad.format(v), 'Achats']}
        />
        <Bar dataKey="total" fill="#ED312E" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
