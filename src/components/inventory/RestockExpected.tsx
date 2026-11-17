import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Truck } from 'lucide-react';

function daysUntilMY(dateStr?: string): number | null {
  if (!dateStr) return null;
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const todayStr = now.toISOString().slice(0, 10);
  const t0 = new Date(todayStr + 'T00:00:00Z').getTime();
  const t1 = new Date(dateStr + 'T00:00:00Z').getTime();
  if (Number.isNaN(t1)) return null;
  return Math.round((t1 - t0) / (86400 * 1000));
}

export function RestockExpected({ items }: { items: any[] }) {
  const incoming = items
    .filter((i) => (i.order_status === 'ordered' || i.order_status === 'shipping') && i.arrival_date)
    .sort((a, b) => String(a.arrival_date).localeCompare(String(b.arrival_date)));

  if (incoming.length === 0) return null;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-indigo-600" />
          Incoming Restock Expected ({incoming.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {incoming.map((item) => {
          const days = daysUntilMY(item.arrival_date);
          let label = item.arrival_date;
          if (days !== null) {
            if (days <= 0) label = 'Arrived / Due Today';
            else if (days === 1) label = 'Tomorrow';
            else label = `In ${days} days`;
          }
          return (
            <div key={item.id} className="flex items-center justify-between text-xs bg-white p-2 rounded border">
              <span className="font-medium text-slate-800">{item.name}</span>
              <Badge variant="outline">{label} ({item.arrival_date})</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
