export function formatBRL(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPct(value) {
  const num = Number(value) || 0;
  return `${num.toFixed(1).replace('.', ',')}%`;
}

export function formatDateBR(dateStr) {
  if (!dateStr) return '-';
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function buildWhatsappUrl(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '#';
  const normalized = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const encoded = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${normalized}${encoded}`;
}

export const ROLE_LABELS = {
  admin: { label: 'Proprietária (Admin)', color: 'bg-berry-100 text-berry-800 border-berry-200' },
  confeiteira: { label: 'Confeiteira (Produção)', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  atendente: { label: 'Atendente (Vendas)', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  visualizador: { label: 'Visualizador (Consulta)', color: 'bg-stone-100 text-stone-700 border-stone-200' },
};

export const ORDER_STATUS_META = {
  orcamento: { label: 'Orçamento', color: 'bg-stone-100 text-stone-700' },
  confirmado: { label: 'Confirmado', color: 'bg-sky-100 text-sky-800' },
  em_producao: { label: 'Em Produção', color: 'bg-amber-100 text-amber-800' },
  pronto: { label: 'Pronto', color: 'bg-emerald-100 text-emerald-800' },
  entregue: { label: 'Entregue', color: 'bg-green-100 text-green-900' },
  cancelado: { label: 'Cancelado', color: 'bg-rose-100 text-rose-800' },
};

export const PAYMENT_STATUS_META = {
  pendente: { label: 'Pendente', color: 'bg-rose-100 text-rose-700' },
  sinal_pago: { label: 'Sinal Pago', color: 'bg-amber-100 text-amber-800' },
  pago: { label: 'Pago Integral', color: 'bg-emerald-100 text-emerald-800' },
};

export function getCompatibleUnitsForSelect(purchaseUnit) {
  const u = String(purchaseUnit || 'un').toLowerCase();
  if (['g', 'kg', 'mg'].includes(u)) return ['g', 'kg'];
  if (['ml', 'l'].includes(u)) return ['ml', 'L'];
  if (['un', 'dz'].includes(u)) return ['un', 'dz'];
  return [purchaseUnit || 'un', 'un'];
}
