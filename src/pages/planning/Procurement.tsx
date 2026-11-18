import React, { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { ShoppingCart, Truck, Users, Plus, ArrowRight } from 'lucide-react';
import { loadMaterialAndPackagingOptions, loadUnitOptions } from '@/lib/masterOptions';

export default function Procurement() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  const [newSup, setNewSup] = useState({ name: '', contact_person: '', phone: '', lead_time_days: 7 });
  const [newPr, setNewPr] = useState({ material_name: '', required_quantity: 100, unit: 'pcs', supplier_id: '' });

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

  const addSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSup.name.trim()) return;
    const { error } = await supabase.from('suppliers').insert(newSup);
    if (error) return toast.error(error.message);
    toast.success('Supplier added');
    setNewSup({ name: '', contact_person: '', phone: '', lead_time_days: 7 });
    loadAll();
  };

  const addPr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPr.material_name.trim()) return;
    const sup = suppliers.find((s) => s.id === newPr.supplier_id);
    const { error } = await supabase.from('purchase_requests').insert({
      ...newPr,
      supplier_name: sup?.name || '',
      lead_time_days: sup?.lead_time_days || 7,
      status: 'pending',
    });
    if (error) return toast.error(error.message);
    toast.success('Purchase Request created');
    setNewPr({ material_name: '', required_quantity: 100, unit: 'pcs', supplier_id: '' });
    loadAll();
  };

  const convertPrToPo = async (pr: any) => {
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    const { error: poErr } = await supabase.from('purchase_orders').insert({
      po_number: poNumber,
      purchase_request_id: pr.id,
      material_name: pr.material_name,
      quantity: pr.required_quantity,
      unit: pr.unit,
      supplier_id: pr.supplier_id,
      supplier_name: pr.supplier_name,
      status: 'pending',
    });
    if (poErr) return toast.error(poErr.message);

    await supabase.from('purchase_requests').update({ status: 'converted' }).eq('id', pr.id);
    toast.success(`Converted to ${poNumber}`);
    loadAll();
  };

  const updatePoStatus = async (poId: string, status: string) => {
    const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', poId);
    if (error) return toast.error(error.message);
    toast.success(`PO marked as ${status}`);
    loadAll();
  };

  return (
    <div className="min-h-screen bg-[#F6F8FC] p-4 sm:p-6 w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-indigo-600" />
          Procurement & Supplier Management
        </h1>
        <p className="text-sm text-slate-500">Manage material suppliers, purchase requisitions (PR), and purchase orders (PO).</p>
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
                  placeholder="Qty"
                  value={newPr.required_quantity}
                  onChange={(e) => setNewPr({ ...newPr, required_quantity: Number(e.target.value) })}
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
                  {requests.map((pr) => (
                    <tr key={pr.id}>
                      <td className="p-3 font-medium">{pr.material_name}</td>
                      <td className="p-3 text-right">{pr.required_quantity} {pr.unit}</td>
                      <td className="p-3">{pr.supplier_name || '-'}</td>
                      <td className="p-3 text-center"><Badge variant="outline">{pr.status}</Badge></td>
                      <td className="p-3 text-right">
                        {pr.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => convertPrToPo(pr)}>
                            <ArrowRight className="w-4 h-4 mr-1" /> Convert to PO
                          </Button>
                        )}
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
                  {orders.map((po) => (
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
                <Input type="number" placeholder="Lead time (days)" value={newSup.lead_time_days} onChange={(e) => setNewSup({ ...newSup, lead_time_days: Number(e.target.value) })} />
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3">{s.contact_person || '-'}</td>
                      <td className="p-3">{s.phone || '-'}</td>
                      <td className="p-3 text-right">{s.lead_time_days} days</td>
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
