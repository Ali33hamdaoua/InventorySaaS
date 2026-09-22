import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { CategoryCostBreakdown } from '@inventorymdb/shared';
import { CHART_PALETTE } from '@/lib/brand';
import { currency } from '@/lib/utils';

interface Props {
  data: CategoryCostBreakdown[];
}

// Maison Burger palette — primary red + warm accent tones
const COLORS = CHART_PALETTE;

export function CategoryBreakdownChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="categoryName"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          stroke="#0a0a0a"
          strokeWidth={2}
        >
          {data.map((_, i) => (
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
          formatter={(v: number, name: string) => [
            currency.format(v),
            name,
          ]}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
