import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';

interface Group {
  qtyPerBox: number;
  boxes: number;
}

export function QuantityCalculator({
  onChange,
}: {
  onChange: (total: number) => void;
}) {
  const [groups, setGroups] = useState<Group[]>([{ qtyPerBox: 0, boxes: 1 }]);

  const total = groups.reduce((sum, g) => sum + (Number(g.qtyPerBox) || 0) * (Number(g.boxes) || 0), 0);

  useEffect(() => {
    onChange(total);
  }, [total, onChange]);

  return (
    <div className="space-y-2 border rounded-md p-3 bg-slate-50">
      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
        <span>Box / Bundle Calculator</span>
        <span className="font-mono font-semibold text-indigo-700">Total: {total}</span>
      </div>
      {groups.map((g, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Qty/Box"
            value={g.qtyPerBox || ''}
            onChange={(e) => {
              const next = [...groups];
              next[idx].qtyPerBox = Number(e.target.value) || 0;
              setGroups(next);
            }}
            className="h-8 text-sm bg-white"
          />
          <span className="text-slate-400 text-xs">×</span>
          <Input
            type="number"
            min={0}
            placeholder="Boxes"
            value={g.boxes || ''}
            onChange={(e) => {
              const next = [...groups];
              next[idx].boxes = Number(e.target.value) || 0;
              setGroups(next);
            }}
            className="h-8 text-sm bg-white"
          />
          {groups.length > 1 && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setGroups(groups.filter((_, i) => i !== idx))}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs"
        onClick={() => setGroups([...groups, { qtyPerBox: 0, boxes: 1 }])}
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Group
      </Button>
    </div>
  );
}
