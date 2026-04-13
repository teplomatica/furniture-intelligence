"""Parse product offers from scraped markdown/HTML."""
import re
import logging
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

# --- Price patterns ---
PRICE_PATTERN = re.compile(r'(\d{1,3}(?:[\s\u00a0]\d{3}){0,3})\s*[₽\u20BD]')
STRIKETHROUGH_PRICE = re.compile(r'~~[^~]*?(\d{1,3}(?:[\s\u00a0]\d{3}){0,3})\s*[₽\u20BD][^~]*~~')

MAX_REASONABLE_PRICE = 5_000_000  # max 5M rubles for furniture
MIN_REASONABLE_PRICE = 500  # min 500 rubles

# --- Product block patterns ---
MD_LINK = re.compile(r'\[([^\]]{5,200})\]\(([^)]+)\)')
MD_IMAGE = re.compile(r'!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|webp|avif)[^)]*)\)', re.IGNORECASE)

# --- Availability ---
IN_STOCK = re.compile(r'[Вв]\s*наличии|в продаже|есть на складе', re.IGNORECASE)
OUT_OF_STOCK = re.compile(r'[Нн]ет в наличии|под заказ|нет на складе|распродано', re.IGNORECASE)

# --- SKU ---
SKU_PATTERN = re.compile(r'(?:Артикул|Арт\.|SKU|Код товара)\s*:?\s*([A-Za-z0-9\-]{3,30})', re.IGNORECASE)

# --- Pagination ---
NEXT_PAGE = re.compile(r'[?&]page=(\d+)')

# Words that are colors/materials, NOT product names
COLOR_WORDS = {
    "бежевый", "белый", "серый", "черный", "чёрный", "синий", "зелёный", "зеленый",
    "красный", "коричневый", "голубой", "розовый", "фиолетовый", "оранжевый",
    "жёлтый", "желтый", "бирюзовый", "аквамарин", "светло-серый", "тёмно-серый",
    "темно-серый", "светло-бежевый", "тёмно-коричневый", "темно-коричневый",
    "графит", "антрацит", "слоновая кость", "мокко", "капучино", "шоколад",
    "венге", "дуб", "бук", "орех", "ясень", "сонома",
}

# Navigation words to skip
SKIP_NAMES = {
    "подробнее", "читать далее", "показать ещё", "загрузить", "смотреть все",
    "войти", "регистрация", "корзина", "каталог", "все товары", "все категории",
    "в корзину", "купить", "заказать", "добавить", "сравнить", "в избранное",
    "доставка", "оплата", "гарантия", "о компании", "контакты",
    "открыть", "закрыть", "назад", "вперёд", "далее",
}

SKIP_URL_PARTS = [
    '/login', '/cart', '/favorites', '/compare', '/search', '/delivery',
    '/payment', '/about', '/contacts', '/stores', '/help',
    'javascript:', 'mailto:', 'tel:', '#',
]


def _parse_price(text: str) -> int | None:
    """Extract integer price from text like '24 990' or '24990'."""
    cleaned = re.sub(r'[\s\u00a0]', '', text)
    try:
        val = int(cleaned)
        if MIN_REASONABLE_PRICE <= val <= MAX_REASONABLE_PRICE:
            return val
        return None
    except ValueError:
        return None


def _is_color_or_skip(name: str) -> bool:
    """Check if name is a color, material, or navigation word."""
    name_lower = name.lower().strip()
    if name_lower in COLOR_WORDS or name_lower in SKIP_NAMES:
        return True
    # Single word under 15 chars without spaces is likely a color/filter
    if len(name_lower) < 15 and ' ' not in name_lower:
        return True
    return False


def _is_product_url(url: str) -> bool:
    """Check if URL looks like a product page (has enough path depth)."""
    parsed = urlparse(url)
    path = parsed.path.rstrip('/')
    if not path:
        return False
    segments = [s for s in path.split('/') if s]
    return len(segments) >= 2  # at least /category/product


def _extract_domain(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower().replace("www.", "")


def _deduplicate_by_name(offers: list[dict]) -> list[dict]:
    """Keep one offer per product name (the one with the most data)."""
    by_name: dict[str, dict] = {}
    for o in offers:
        name = o["name"].lower().strip()
        existing = by_name.get(name)
        if not existing:
            by_name[name] = o
        else:
            # Keep the one with more data (price > no price, availability > none)
            score_new = (1 if o.get("price") else 0) + (1 if o.get("is_available") is not None else 0) + (1 if o.get("sku") else 0)
            score_old = (1 if existing.get("price") else 0) + (1 if existing.get("is_available") is not None else 0) + (1 if existing.get("sku") else 0)
            if score_new > score_old:
                by_name[name] = o
    return list(by_name.values())


def parse_offers_generic(markdown: str, base_url: str) -> list[dict]:
    """Generic markdown parser: extract product blocks with name, price, url, image."""
    offers = []
    seen_urls = set()

    for match in MD_LINK.finditer(markdown):
        name = match.group(1).strip()
        url = match.group(2).strip()

        # Skip non-product links
        if _is_color_or_skip(name):
            continue
        if any(skip in url.lower() for skip in SKIP_URL_PARTS):
            continue

        # Resolve relative URLs
        if url.startswith('/'):
            url = urljoin(base_url, url)

        # Must look like a product URL
        if not _is_product_url(url):
            continue

        # Deduplicate by URL
        if url in seen_urls:
            continue
        seen_urls.add(url)

        # Context after and before the link
        start = match.end()
        context = markdown[start:start + 400]
        pre_context = markdown[max(0, match.start() - 200):match.start()]

        # Extract price
        price = None
        price_old = None
        strikethrough = STRIKETHROUGH_PRICE.search(context)
        if strikethrough:
            price_old = _parse_price(strikethrough.group(1))

        price_match = PRICE_PATTERN.search(context)
        if price_match:
            price = _parse_price(price_match.group(1))
            if price and price_old and price == price_old:
                remaining = context[price_match.end():]
                second = PRICE_PATTERN.search(remaining)
                if second:
                    price = _parse_price(second.group(1))

        # Also check pre-context for price (some sites put price before link)
        if not price:
            price_match_pre = PRICE_PATTERN.search(pre_context)
            if price_match_pre:
                price = _parse_price(price_match_pre.group(1))

        # Extract image
        image_url = None
        img_match = MD_IMAGE.search(pre_context) or MD_IMAGE.search(context)
        if img_match:
            img = img_match.group(1)
            if img.startswith('/'):
                img = urljoin(base_url, img)
            image_url = img

        # Extract availability
        is_available = None
        if IN_STOCK.search(context):
            is_available = True
        elif OUT_OF_STOCK.search(context):
            is_available = False

        # Extract SKU
        sku = None
        sku_match = SKU_PATTERN.search(context)
        if sku_match:
            sku = sku_match.group(1)

        offers.append({
            "name": name,
            "url": url,
            "price": price,
            "price_old": price_old,
            "is_available": is_available,
            "image_url": image_url,
            "sku": sku,
            "characteristics": None,
        })

    # Deduplicate by product name (color variants → one entry)
    return _deduplicate_by_name(offers)


def detect_has_next_page(markdown: str, current_page: int) -> bool:
    """Check if there's a next page link in the markdown."""
    for match in NEXT_PAGE.finditer(markdown):
        page_num = int(match.group(1))
        if page_num > current_page:
            return True
    if re.search(r'[Сс]ледующая|[Nn]ext\s*[→»>]', markdown):
        return True
    return False


# --- Site-specific parsers ---

SITE_PARSERS: dict[str, callable] = {}


def parse_offers(markdown: str, base_url: str) -> list[dict]:
    """Dispatch to site-specific parser or fall back to generic."""
    domain = _extract_domain(base_url)
    parser = SITE_PARSERS.get(domain)
    if parser:
        result = parser(markdown, base_url)
        if result:
            return result
    return parse_offers_generic(markdown, base_url)
