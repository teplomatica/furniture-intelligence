"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { CompanyHeader } from "@/components/company-detail/CompanyHeader";
import { LegalEntitiesSection } from "@/components/company-detail/LegalEntitiesSection";
import { FinancialsSection } from "@/components/company-detail/FinancialsSection";
import { TrafficSection } from "@/components/company-detail/TrafficSection";
import { AssortmentSection } from "@/components/company-detail/AssortmentSection";
import { RefreshPanel } from "@/components/company-detail/RefreshPanel";
import { CompanyForm } from "@/components/CompanyForm";
import { LegalEntityForm } from "@/components/LegalEntityForm";
import { FinancialForm } from "@/components/FinancialForm";
import { TrafficForm } from "@/components/TrafficForm";
import { AssortmentForm } from "@/components/AssortmentForm";

interface Company {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  segment_group: string;
  positioning: string | null;
  notes: string | null;
  is_active: boolean;
}

interface LegalEntity {
  id: number;
  company_id: number;
  inn: string | null;
  ogrn: string | null;
  legal_name: string;
  address: string | null;
  region: string | null;
  founded_year: number | null;
  manager_name: string | null;
  is_primary: boolean;
}

interface Financial {
  id: number;
  legal_entity_id: number;
  year: number;
  revenue: number | null;
  net_profit: number | null;
  ebitda: number | null;
  total_assets: number | null;
  employee_count: number | null;
  source: string;
}

interface Traffic {
  id: number;
  company_id: number;
  period: string;
  monthly_visits: number | null;
  bounce_rate: number | null;
  avg_visit_duration_sec: number | null;
  pages_per_visit: number | null;
  source: string;
}

interface Assortment {
  id: number;
  company_id: number;
  category_id: number;
  price_segment_id: number | null;
  sku_count: number | null;
  availability_pct: number | null;
  price_min: number | null;
  price_max: number | null;
  price_median: number | null;
  source: string;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  level: number;
  parent_id: number | null;
}

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [traffic, setTraffic] = useState<Traffic[]>([]);
  const [assortment, setAssortment] = useState<Assortment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // UI state
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [leFormOpen, setLeFormOpen] = useState(false);
  const [finFormOpen, setFinFormOpen] = useState(false);
  const [trafficFormOpen, setTrafficFormOpen] = useState(false);
  const [assortFormOpen, setAssortFormOpen] = useState(false);
  const [editFinancial, setEditFinancial] = useState<Financial | null>(null);
  const [editTraffic, setEditTraffic] = useState<Traffic | null>(null);
  const [editAssortment, setEditAssortment] = useState<Assortment | null>(null);

  const loadCompany = useCallback(async () => {
    try {
      const c = await api.get<Company>(`/companies/by-slug/${slug}`);
      setCompany(c);
      return c;
    } catch {
      setNotFound(true);
      return null;
    }
  }, [slug]);

  const loadDetails = useCallback(async (companyId: number) => {
    const [le, fin, tr, assort, cats] = await Promise.all([
      api.get<LegalEntity[]>(`/legal-entities?company_id=${companyId}`),
      api.get<Financial[]>(`/financials?company_id=${companyId}`),
      api.get<Traffic[]>(`/traffic?company_id=${companyId}`),
      api.get<Assortment[]>(`/assortment?company_id=${companyId}`),
      api.get<Category[]>("/categories"),
    ]);
    setEntities(le);
    setFinancials(fin);
    setTraffic(tr);
    setAssortment(assort);
    setCategories(cats);
  }, []);

  const loadAll = useCallback(async () => {
    const c = await loadCompany();
    if (c) await loadDetails(c.id);
    setLoading(false);
  }, [loadCompany, loadDetails]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const reloadDetails = () => {
    if (company) loadDetails(company.id);
  };

  const handleDeleteLE = async (id: number, name: string) => {
    if (!confirm(`Удалить ${name}?`)) return;
    await api.delete(`/legal-entities/${id}`);
    reloadDetails();
  };

  if (loading) return <div className="text-gray-400">Загрузка...</div>;
  if (notFound || !company) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Компания не найдена</p>
        <Link href="/companies" className="text-blue-600 hover:underline">Вернуться к списку</Link>
      </div>
    );
  }

  const hasLegalEntities = entities.length > 0;
  const hasOgrn = entities.some((le) => !!le.ogrn);

  return (
    <div>
      <div className="mb-4">
        <Link href="/companies" className="text-sm text-gray-400 hover:text-gray-600">
          &larr; Все конкуренты
        </Link>
      </div>

      <CompanyHeader
        company={company}
        onEdit={() => setEditFormOpen(true)}
        onRefresh={() => setRefreshOpen(!refreshOpen)}
        refreshing={false}
      />

      {refreshOpen && (
        <RefreshPanel
          companyId={company.id}
          hasLegalEntities={hasLegalEntities}
          hasOgrn={hasOgrn}
          onClose={() => setRefreshOpen(false)}
          onComplete={reloadDetails}
        />
      )}

      <LegalEntitiesSection
        entities={entities}
        onAdd={() => setLeFormOpen(true)}
        onDelete={handleDeleteLE}
      />

      <FinancialsSection
        entities={entities}
        financials={financials}
        onAdd={() => { setEditFinancial(null); setFinFormOpen(true); }}
        onEdit={(f) => { setEditFinancial(f); setFinFormOpen(true); }}
      />

      <TrafficSection
        traffic={traffic}
        onAdd={() => { setEditTraffic(null); setTrafficFormOpen(true); }}
        onEdit={(t) => { setEditTraffic(t); setTrafficFormOpen(true); }}
      />

      <AssortmentSection
        assortment={assortment}
        categories={categories}
        onAdd={() => { setEditAssortment(null); setAssortFormOpen(true); }}
        onEdit={(a) => { setEditAssortment(a); setAssortFormOpen(true); }}
      />

      <CompanyForm
        open={editFormOpen}
        onClose={() => setEditFormOpen(false)}
        onSaved={() => { loadCompany(); setEditFormOpen(false); }}
        editCompany={company}
      />

      <LegalEntityForm
        open={leFormOpen}
        onClose={() => setLeFormOpen(false)}
        onSaved={reloadDetails}
        companyId={company.id}
      />

      <FinancialForm
        open={finFormOpen}
        onClose={() => setFinFormOpen(false)}
        onSaved={reloadDetails}
        legalEntities={entities}
        editRecord={editFinancial}
      />

      <TrafficForm
        open={trafficFormOpen}
        onClose={() => setTrafficFormOpen(false)}
        onSaved={reloadDetails}
        companies={[company]}
        editRecord={editTraffic}
        defaultCompanyId={company.id}
      />

      <AssortmentForm
        open={assortFormOpen}
        onClose={() => setAssortFormOpen(false)}
        onSaved={reloadDetails}
        companies={[company]}
        categories={categories}
        editRecord={editAssortment}
        defaultCompanyId={company.id}
      />
    </div>
  );
}
