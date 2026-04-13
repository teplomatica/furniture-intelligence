"""Parse product offers from scraped markdown/HTML."""
import re
import logging
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

# --- Price patterns ---
PRICE_PATTERN = re.compile(r'(\d[\d\s]{0,15}\d)\s*[₽\u20BD руб\.]')
STRIKETHROUGH_PRICE = re.compile(r'~~[^~]*?(\d[\d\s]{0,15}\d)\s*[₽\u20BD руб\.][^~]*~~')

# --- Product block patterns ---
# Markdown link with text: [Product Name](url)
MD_LINK = re.compile(r'\[([^\]]{5,200})\]\(([^)]+)\)')
# Image: ![...](url)
MD_IMAGE = re.compile(r'!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|webp|avif)[^)]*)\)', re.IGNORECASE)

# --- Availability ---
IN_STOCK = re.compile(r'[Вв]\s*наличии|в продаже|есть на складе', re.IGNORECASE)
OUT_OF_STOCK = re.compile(r'[Нн]ет в наличии|под заказ|нет на складе|распродано', re.IGNORECASE)

# --- SKU ---
SKU_PATTERN = re.compile(r'(?:Артикул|Арт\.|SKU|Код товара)\s*:?\s*([A-Za-z0-9\-]{3,30})', re.IGNORECASE)

# --- Pagination ---
NEXT_PAGE = re.compile(r'[?&]page=(\d+)')


def _parse_price(text: str) -> int | None:
    """Extract integer price from text like '24 990' or '24990'."""
    cleaned = re.sub(r'\s', '', text)
    try:
        return int(cleaned)
    except ValueError:
        return None


def _extract_domain(url: str) -> str:
    parsed = urlparse(url)
    return parsed.netloc.lower().replace("www.", "")


def parse_offers_generic(markdown: str, base_url: str) -> list[dict]:
    """Generic markdown parser: extract product blocks with name, price, url, image."""
    offers = []
    seen_urls = set()

    # Find all markdown links as potential product entries
    for match in MD_LINK.finditer(markdown):
        name = match.group(1).strip()
        url = match.group(2).strip()

        # Skip navigation/utility links
        if len(name) < 5 or len(name) > 200:
            continue
        if any(skip in url.lower() for skip in [
            '/login', '/cart', '/favorites', '/compare', '/search',
            'javascript:', 'mailto:', 'tel:', '#',
        ]):
            continue
        if any(skip in name.lower() for skip in [
            'подробнее', 'читать далее', 'показать ещё', 'загрузить',
            'войти', 'регистрация', 'корзина', 'каталог',
        ]):
            continue

        # Resolve relative URLs
        if url.startswith('/'):
            url = urljoin(base_url, url)

        # Deduplicate
        if url in seen_urls:
            continue
        seen_urls.add(url)

        # Get surrounding text (300 chars after the link)
        start = match.end()
        context = markdown[start:start + 500]

        # Extract price from context
        price = None
        price_old = None
        strikethrough = STRIKETHROUGH_PRICE.search(context)
        if strikethrough:
            price_old = _parse_price(strikethrough.group(1))

        price_match = PRICE_PATTERN.search(context)
        if price_match:
            price = _parse_price(price_match.group(1))
            # If price equals old price, try next match
            if price and price_old and price == price_old:
                remaining = context[price_match.end():]
                second = PRICE_PATTERN.search(remaining)
                if second:
                    price = _parse_price(second.group(1))

        # Extract image from context or before the link
        image_url = None
        pre_context = markdown[max(0, match.start() - 300):match.start()]
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

        # Only keep if we have meaningful data (name + at least price or url with product path)
        if price or (url and '/' in urlparse(url).path and len(urlparse(url).path) > 5):
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

    return offers


def detect_has_next_page(markdown: str, current_page: int) -> bool:
    """Check if there's a next page link in the markdown."""
    for match in NEXT_PAGE.finditer(markdown):
        page_num = int(match.group(1))
        if page_num > current_page:
            return True
    # Also check for "Следующая" / "next" links
    if re.search(r'[Сс]ледующая|[Nn]ext\s*[→»>]', markdown):
        return True
    return False


# --- Site-specific parsers ---
# Can be extended per retailer for higher accuracy

SITE_PARSERS: dict[str, callable] = {
    # "hoff.ru": parse_hoff_catalog,
    # "askona.ru": parse_askona_catalog,
}


def parse_offers(markdown: str, base_url: str) -> list[dict]:
    """Dispatch to site-specific parser or fall back to generic."""
    domain = _extract_domain(base_url)
    parser = SITE_PARSERS.get(domain)
    if parser:
        result = parser(markdown, base_url)
        if result:
            return result
    return parse_offers_generic(markdown, base_url)
