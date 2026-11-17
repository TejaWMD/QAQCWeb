import { useState, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

export interface UndoAction {
  label: string;
  table: string;
  type: 'create' | 'update' | 'soft_delete';
  recordId: string;
  previousData?: Record<string, any>;
}

export function useUndoLastAction() {
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const recordUndo = useCallback((action: UndoAction) => {
    setLastAction(action);
  }, []);

  const undo = useCallback(async () => {
    if (!lastAction) return false;
    setIsUndoing(true);
    try {
      if (lastAction.type === 'create') {
        await supabase.from(lastAction.table).delete().eq('id', lastAction.recordId);
      } else if (lastAction.type === 'soft_delete') {
        await supabase
          .from(lastAction.table)
          .update({ deleted: false, deleted_at: null })
          .eq('id', lastAction.recordId);
      } else if (lastAction.type === 'update' && lastAction.previousData) {
        await supabase
          .from(lastAction.table)
          .update(lastAction.previousData)
          .eq('id', lastAction.recordId);
      }
      setLastAction(null);
      return true;
    } finally {
      setIsUndoing(false);
    }
  }, [lastAction]);

  return { lastAction, isUndoing, recordUndo, undo, clearUndo: () => setLastAction(null) };
}
