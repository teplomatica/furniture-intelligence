from typing import Optional
import httpx
from app.core.config import settings


class DataNewtonClient:
    def __init__(self):
        self.base_url = settings.datanewton_base_url
        self.api_key = settings.datanewton_api_key

    def _headers(self) -> dict:
        return {"X-Api-Key": self.api_key} if self.api_key else {}

    async def search_counterparty(self, query: str, limit: int = 10) -> list[dict]:
        """Поиск компании по названию или ИНН."""
        if not self.api_key:
            return []
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{self.base_url}/counterparty",
                params={"query": query, "limit": limit, "offset": 0, "key": self.api_key},
            )
            r.raise_for_status()
            data = r.json()
            return data.get("data", {}).get("counterparties", [])

    async def get_finance(self, ogrn: str) -> Optional[dict]:
        """Получить финансовые данные по ОГРН."""
        if not self.api_key:
            return None
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{self.base_url}/finance",
                params={"ogrn": ogrn, "key": self.api_key},
            )
            r.raise_for_status()
            return r.json()

    def parse_financials(self, raw: dict) -> list[dict]:
        """Извлечь выручку/прибыль из ответа DataNewton по годам."""
        results = []
        fr = raw.get("fin_results", {})
        indicators = fr.get("indicators", [])
        years = fr.get("years", [])

        key_codes = {"2110": "revenue", "2400": "net_profit", "2200": "ebitda"}
        by_code = {}
        for item in indicators:
            code = str(item.get("code", ""))
            if code in key_codes:
                by_code[code] = item.get("sum", {})

        for year in years:
            row = {"year": year}
            for code, field in key_codes.items():
                val = by_code.get(code, {}).get(str(year))
                row[field] = float(val) if val else None
            if any(row[f] for f in key_codes.values()):
                results.append(row)

        return results

    def parse_counterparty(self, raw: dict) -> dict:
        """Нормализовать запись контрагента из DataNewton."""
        return {
            "datanewton_id": raw.get("ogrn") or raw.get("id"),
            "inn": raw.get("inn"),
            "ogrn": raw.get("ogrn"),
            "legal_name": raw.get("name"),
            "address": raw.get("address"),
            "region": raw.get("region"),
            "manager_name": raw.get("manager_name"),
            "activity_code": raw.get("activity_kind"),
            "activity_description": raw.get("activity_kind_dsc"),
            "founded_year": _parse_year(raw.get("establishment_date")),
            "raw_data": raw,
        }


def _parse_year(date_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    try:
        return int(date_str[:4])
    except (ValueError, TypeError):
        return None


datanewton = DataNewtonClient()
