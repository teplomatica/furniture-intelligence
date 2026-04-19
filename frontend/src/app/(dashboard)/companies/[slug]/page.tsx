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
import { OffersSection } from "@/components/company-detail/OffersSection";
import { ScrapeConfigPanel } from "@/components/company-detail/ScrapeConfigPanel";
import { RefreshPanel } from "@/components/company-detail/RefreshPanel";
import { CompanyForm } from "@/components/CompanyForm";
import { LegalEntityForm } from "@/components/LegalEntityForm";
import { FinancialForm } from "@/components/FinancialForm";
import { TrafficForm } from "@/components/TrafficForm";
import { AssortmentForm } from "@/components/AssortmentForm";
import { OfferForm } from "@/components/OfferForm";
// ScrapingConfigForm removed — replaced by ScrapeConfigPanel
import { SiteAnalysisWizard } from "@/components/company-detail/SiteAnalysisWizard";

interface Company {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  websites: string[] | null;
  segment_group: string;
  positioning: string | null;
  notes: string | null;
  is_active: boolean;
  is_self: boolean;
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

interface Region {
  id: number;
  name: string;
}

interface Offer {
  id: number;
  company_id: number;
  region_id: number;
  name: string;
  url: string | null;
  sku: string | null;
  price: number | null;
  price_old: number | null;
  is_available: boolean | null;
  category_id: number | null;
  category_source: string;
  price_segment_id: number | null;
}

interface OfferListResponse {
  items: Offer[];
  total: number;
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
  const [regions, setRegions] = useState<Region[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersTotal, setOffersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Offer filters
  const [offerRegionId, setOfferRegionId] = useState<number | null>(null);
  const [offerCategoryId, setOfferCategoryId] = useState<number | null>(null);
  const [offerUncategorized, setOfferUncategorized] = useState(false);
  const [offerPage, setOfferPage] = useState(0);
  const offerPageSize = 50;

  // UI state
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [leFormOpen, setLeFormOpen] = useState(false);
  const [editLE, setEditLE] = useState<LegalEntity | null>(null);
  const [finFormOpen, setFinFormOpen] = useState(false);
  const [trafficFormOpen, setTrafficFormOpen] = useState(false);
  const [assortFormOpen, setAssortFormOpen] = useState(false);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [categoryMappings, setCategoryMappings] = useState<any[]>([]);
  const [regionMappings, setRegionMappings] = useState<any[]>([]);
  const [scrapeMatrix, setScrapeMatrix] = useState<any[]>([]);
  const [editFinancial, setEditFinancial] = useState<Financial | null>(null);
  const [editTraffic, setEditTraffic] = useState<Traffic | null>(null);
  const [editAssortment, setEditAssortment] = useState<Assortment | null>(null);
  const [editOffer, setEditOffer] = useState<Offer | null>(null);

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
    const [le, fin, tr, assort, cats, regs, catMaps, regMaps, matrixData] = await Promise.all([
      api.get<LegalEntity[]>(`/legal-entities?company_id=${companyId}`),
      api.get<Financial[]>(`/financials?company_id=${companyId}`),
      api.get<Traffic[]>(`/traffic?company_id=${companyId}`),
      api.get<Assortment[]>(`/assortment?company_id=${companyId}`),
      api.get<Category[]>("/categories"),
      api.get<Region[]>("/regions"),
      api.get<any[]>(`/companies/${companyId}/category-mappings`),
      api.get<any[]>(`/companies/${companyId}/region-mappings`),
      api.get<any[]>(`/companies/${companyId}/scrape-matrix`),
    ]);
    setEntities(le);
    setFinancials(fin);
    setTraffic(tr);
    setAssortment(assort);
    setCategories(cats);
    setRegions(regs);
    setCategoryMappings(catMaps);
    setRegionMappings(regMaps);
    setScrapeMatrix(matrixData);
  }, []);

  const loadOffers = useCallback(async (companyId: number) => {
    const params = new URLSearchParams({ company_id: String(companyId), limit: String(offerPageSize), offset: String(offerPage * offerPageSize) });
    if (offerRegionId) params.set("region_id", String(offerRegionId));
    if (offerCategoryId) params.set("category_id", String(offerCategoryId));
    if (offerUncategorized) params.set("uncategorized_only", "true");
    const res = await api.get<OfferListResponse>(`/offers?${params}`);
    setOffers(res.items);
    setOffersTotal(res.total);
  }, [offerPage, offerRegionId, offerCategoryId, offerUncategorized]);

  const loadAll = useCallback(async () => {
    const c = await loadCompany();
    if (c) {
      await loadDetails(c.id);
      await loadOffers(c.id);
    }
    setLoading(false);
  }, [loadCompany, loadDetails, loadOffers]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload offers when filters change
  useEffect(() => {
    if (company) loadOffers(company.id);
  }, [company, offerPage, offerRegionId, offerCategoryId, offerUncategorized, loadOffers]);

  const reloadDetails = () => {
    if (company) {
      loadDetails(company.id);
      loadOffers(company.id);
    }
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
        onDelete={async () => {
          if (!confirm(`Удалить ${company.name} и все связанные данные?`)) return;
          await api.delete(`/companies/${company.id}`);
          router.push("/companies");
        }}
        refreshing={false}
      />

      {refreshOpen && (
        <RefreshPanel
          companyId={company.id}
          hasLegalEntities={hasLegalEntities}
          hasOgrn={hasOgrn}
          hasScrapingConfig={scrapeMatrix.filter((m: any) => m.enabled).length > 0}
          regions={regions}
          onClose={() => setRefreshOpen(false)}
          onComplete={reloadDetails}
        />
      )}

      <LegalEntitiesSection
        entities={entities}
        onAdd={() => { setEditLE(null); setLeFormOpen(true); }}
        onEdit={(le) => { setEditLE(le); setLeFormOpen(true); }}
        onDelete={handleDeleteLE}
      />

      <FinancialsSection
        entities={entities}
        financials={financials}
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

      <ScrapeConfigPanel
        companyId={company.id}
        categories={categories}
        regions={regions}
        categoryMappings={categoryMappings}
        regionMappings={regionMappings}
        matrix={scrapeMatrix}
        onReload={reloadDetails}
        onAnalyze={() => setWizardOpen(true)}
      />

      <OffersSection
        offers={offers}
        total={offersTotal}
        regions={regions}
        categories={categories}
        companyId={company.id}
        onEdit={(o) => { setEditOffer(o); setOfferFormOpen(true); }}
        onReload={() => { if (company) loadOffers(company.id); }}
        filterRegionId={offerRegionId}
        onFilterRegion={setOfferRegionId}
        filterCategoryId={offerCategoryId}
        onFilterCategory={setOfferCategoryId}
        uncategorizedOnly={offerUncategorized}
        onUncategorizedOnly={setOfferUncategorized}
        page={offerPage}
        onPageChange={setOfferPage}
        pageSize={offerPageSize}
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
        editRecord={editLE}
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

      <OfferForm
        open={offerFormOpen}
        onClose={() => setOfferFormOpen(false)}
        onSaved={() => { if (company) loadOffers(company.id); }}
        companyId={company.id}
        regions={regions}
        categories={categories}
        editRecord={editOffer}
      />

      <SiteAnalysisWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        companyId={company.id}
        regions={regions}
        categories={categories}
        onApplied={reloadDetails}
      />
    </div>
  );
}
