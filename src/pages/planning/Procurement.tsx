import React, { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { ShoppingCart, Truck, Users, Plus, ArrowRight, Trash2 } from 'lucide-react';
import { loadMaterialAndPackagingOptions, loadUnitOptions } from '@/lib/masterOptions';

export default function Procurement() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  const [newSup, setNewSup] = useState<Record<string, any>>({ name: '', contact_person: '', phone: '', lead_time_days: '7' });
  const [newPr, setNewPr] = useState<Record<string, any>>({ material_name: '', required_quantity: '', unit: 'pcs', supplier_id: '' });

  const loadAll = async () => {
    const [s, r, o, mats, u] = await Promise.all([
      supabase.from('suppliers').select('*').eq('deleted', false).order('name'),
      supabase.from('purchase_requests').select('*').eq('deleted', false).order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('*').eq('deleted', false).order('created_at', { ascending: false }),
      loadMaterialAndPackagingOptions(),
      loadUnitOptions(),
    ]);
    setSuppliers(s.data || []);
    setRequests(r.data || []);
    setOrders(o.data || []);
    setMaterials(mats || []);
    setUnits(u || []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const [busy, setBusy] = useState(false);

  const addSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!newSup.name.trim()) return toast.error('Supplier name is required.');
    setBusy(true);
    try {
      const { error } = await supabase.from('suppliers').insert({
        name: newSup.name.trim(),
        contact_person: newSup.contact_person || '',
        phone: newSup.phone || '',
        lead_time_days: Number(newSup.lead_time_days) || 7,
        deleted: false,
      });
      if (error) return toast.error(error.message);
      toast.success('Supplier added');
      setNewSup({ name: '', contact_person: '', phone: '', lead_time_days: '7' });
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const addPr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!newPr.material_name.trim()) return toast.error('Select or enter a material.');
    const qty = Number(newPr.required_quantity);
    if (!(qty > 0)) return toast.error('Required quantity must be greater than zero.');
    setBusy(true);
    try {
      const sup = suppliers.find((s) => s.id === newPr.supplier_id);
      const { error } = await supabase.from('purchase_requests').insert({
        material_name: newPr.material_name.trim(),
        required_quantity: qty,
        unit: newPr.unit || 'pcs',
        supplier_id: newPr.supplier_id || null,
        supplier_name: sup?.name || '',
        lead_time_days: sup?.lead_time_days || 7,
        status: 'pending',
        deleted: false,
      });
      if (error) return toast.error(error.message);
      toast.success('Purchase Request created');
      setNewPr({ material_name: '', required_quantity: '', unit: 'pcs', supplier_id: '' });
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const convertPrToPo = async (pr: any) => {
    if (busy) return;
    setBusy(true);
    try {
      const poNumber = `PO-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const { error: poErr } = await supabase.from('purchase_orders').insert({
        po_number: poNumber,
        purchase_request_id: pr.id,
        material_name: pr.material_name,
        quantity: pr.required_quantity,
        unit: pr.unit,
        supplier_id: pr.supplier_id || null,
        supplier_name: pr.supplier_name || '',
        status: 'pending',
        deleted: false,
      });
      if (poErr) return toast.error(poErr.message);

      const { error: prErr } = await supabase.from('purchase_requests').update({ status: 'converted' }).eq('id', pr.id);
      if (prErr) toast.error(`PO created (${poNumber}), but PR status update failed: ${prErr.message}`);
      else toast.success(`Converted to ${poNumber}`);
      loadAll();
    } finally {
      setBusy(false);
    }
  };

  const updatePoStatus = async (poId: string, status: string) => {
    const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', poId);
    if (error) return toast.error(error.message);
    toast.success(`PO marked as ${status}`);
    loadAll();
  };

  const deleteRecord = async (table: 'purchase_requests' | 'purchase_orders' | 'suppliers', id: string) => {
    const label = table === 'purchase_requests' ? 'purchase request' : table === 'purchase_orders' ? 'purchase order' : 'supplier';
    if (!window.confirm(`Delete this ${label}?`)) return;
    const now = new Date().toISOString();
    if (table === 'suppliers') {
      await Promise.all([
        supabase.from('purchase_requests').update({ supplier_id: null, updated_at: now }).eq('supplier_id', id),
        supabase.from('purchase_orders').update({ supplier_id: null, updated_at: now }).eq('supplier_id', id),
      ]);
    }
    const { error } = await supabase.from(table).update({ deleted: true, updated_at: now }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Record removed');
    loadAll();
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 md:p-6 w-full space-y-4">
      <div>
        <h2 className="text-[#0F294A] text-lg font-semibold">Procurement</h2>
        <p className="text-[#64748B] text-sm mt-1">Manage suppliers, purchase requests (PR), and purchase orders (PO).</p>
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Purchase Requests ({requests.length})</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers ({suppliers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">New Purchase Request</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={addPr} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <SearchableSelect
                  value={newPr.material_name}
                  onValueChange={(v) => {
                    const match = materials.find((m) => m.value === v);
                    setNewPr((prev) => ({
                      ...prev,
                      material_name: v,
                      ...(match?.unit ? { unit: match.unit } : {}),
                    }));
                  }}
                  options={materials}
                  placeholder="Select material..."
                  searchPlaceholder="Search material..."
                  allowCustom
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Qty"
                  value={newPr.required_quantity}
                  onChange={(e) => setNewPr({ ...newPr, required_quantity: e.target.value })}
                />
                <SearchableSelect
                  value={newPr.unit}
                  onValueChange={(v) => setNewPr({ ...newPr, unit: v })}
                  options={units}
                  placeholder="Unit"
                  searchPlaceholder="Search unit..."
                  allowCustom
                />
                <SearchableSelect
                  value={newPr.supplier_id}
                  onValueChange={(v) => setNewPr({ ...newPr, supplier_id: v })}
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Select supplier..."
                  searchPlaceholder="Search supplier..."
                  clearable
                />
                <Button type="submit"><Plus className="w-4 h-4 mr-1" /> Create PR</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3">Material</th>
                    <th className="text-right p-3">Qty</th>
                    <th className="text-left p-3">Supplier</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-right p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {requests.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-500">No purchase requests yet.</td></tr>
                  ) : requests.map((pr) => (
                    <tr key={pr.id}>
                      <td className="p-3 font-medium">{pr.material_name}</td>
                      <td className="p-3 text-right">{pr.required_quantity} {pr.unit}</td>
                      <td className="p-3">{pr.supplier_name || '-'}</td>
                      <td className="p-3 text-center"><Badge variant="outline">{pr.status}</Badge></td>
                      <td className="p-3 text-right space-x-2">
                        {pr.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => convertPrToPo(pr)}>
                            <ArrowRight className="w-4 h-4 mr-1" /> Convert to PO
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => deleteRecord('purchase_requests', pr.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3">PO #</th>
                    <th className="text-left p-3">Material</th>
                    <th className="text-right p-3">Qty</th>
                    <th className="text-left p-3">Supplier</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-500">No purchase orders yet.</td></tr>
                  ) : orders.map((po) => (
                    <tr key={po.id}>
                      <td className="p-3 font-mono font-semibold">{po.po_number}</td>
                      <td className="p-3">{po.material_name}</td>
                      <td className="p-3 text-right">{po.quantity} {po.unit}</td>
                      <td className="p-3">{po.supplier_name || '-'}</td>
                      <td className="p-3 text-center"><Badge>{po.status}</Badge></td>
                      <td className="p-3 text-right space-x-2">
                        {po.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => updatePoStatus(po.id, 'in_progress')}>
                            <Truck className="w-4 h-4 mr-1" /> Mark In Transit
                          </Button>
                        )}
                        {po.status !== 'received' && po.status !== 'cancelled' && (
                          <Button size="sm" onClick={() => updatePoStatus(po.id, 'received')}>
                            Mark Received
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => deleteRecord('purchase_orders', po.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Add Supplier</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={addSupplier} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <Input placeholder="Supplier name" value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} />
                <Input placeholder="Contact person" value={newSup.contact_person} onChange={(e) => setNewSup({ ...newSup, contact_person: e.target.value })} />
                <Input placeholder="Phone" value={newSup.phone} onChange={(e) => setNewSup({ ...newSup, phone: e.target.value })} />
                <Input type="number" min="0" placeholder="Lead time (days)" value={newSup.lead_time_days} onChange={(e) => setNewSup({ ...newSup, lead_time_days: e.target.value })} />
                <Button type="submit"><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Contact</th>
                    <th className="text-left p-3">Phone</th>
                    <th className="text-right p-3">Lead Time</th>
                    <th className="text-right p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suppliers.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-slate-500">No suppliers added yet.</td></tr>
                  ) : suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3">{s.contact_person || '-'}</td>
                      <td className="p-3">{s.phone || '-'}</td>
                      <td className="p-3 text-right">{s.lead_time_days} days</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => deleteRecord('suppliers', s.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
