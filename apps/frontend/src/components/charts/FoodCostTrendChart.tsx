import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { FoodCostTrendPoint } from '@inventorymdb/shared';
import { BRAND_COLORS } from '@/lib/brand';

interface Props {
  data: FoodCostTrendPoint[];
}

export function FoodCostTrendChart({ data }: Props) {
  const formatted = data.map((d) => ({
    label: `${String(d.month).padStart(2, '0')}/${d.year}`,
    pct: d.foodCostPercentage ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={formatted} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#A0A0A0" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#A0A0A0"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            color: '#FAF8F5',
            fontSize: 12,
          }}
          formatter={(v: number) => [`${v.toFixed(2)}%`, 'Food cost']}
        />
        <Line
          type="monotone"
          dataKey="pct"
          stroke={BRAND_COLORS.primary}
          strokeWidth={2.5}
          dot={{ r: 4, fill: BRAND_COLORS.primary, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: BRAND_COLORS.primary, stroke: '#fff', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
