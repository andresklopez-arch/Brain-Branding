import httpx
from bs4 import BeautifulSoup
import urllib.parse
import re
import asyncio
from typing import Set, List

class WebScraper:
    def __init__(self, max_pages: int = 5):
        self.max_pages = max_pages
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def clean_html(self, html_content: str) -> str:
        """Removes script, style, navigation and junk tags to extract clean text."""
        soup = BeautifulSoup(html_content, "html.parser")
        
        # Remove non-content tags
        for tag in soup(["script", "style", "noscript", "header", "footer", "nav", "svg", "iframe", "form", "button"]):
            tag.decompose()
            
        # Extract text
        text = soup.get_text(separator="\n")
        
        # Clean up whitespace and empty lines
        lines = [line.strip() for line in text.splitlines()]
        clean_lines = [line for line in lines if line and len(line) > 3]
        
        return "\n".join(clean_lines)

    async def fetch_page(self, client: httpx.AsyncClient, url: str) -> str:
        """Asynchronously fetches a URL page and returns the cleaned text."""
        try:
            response = await client.get(url, headers=self.headers, timeout=10.0, follow_redirects=True)
            if response.status_code == 200:
                return response.text
        except Exception as e:
            print(f"[SCRAPE ERROR] Failed to fetch {url}: {str(e)}")
        return ""

    def extract_links(self, html_content: str, base_url: str) -> Set[str]:
        """Extracts internal links belonging to the same domain."""
        soup = BeautifulSoup(html_content, "html.parser")
        parsed_base = urllib.parse.urlparse(base_url)
        base_domain = parsed_base.netloc
        
        links = set()
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"]
            # Convert relative URL to absolute
            absolute_url = urllib.parse.urljoin(base_url, href)
            parsed_abs = urllib.parse.urlparse(absolute_url)
            
            # Filter internal links and omit media/anchor elements
            if parsed_abs.netloc == base_domain:
                # Remove query params/fragments to avoid duplicate pages
                cleaned_url = urllib.parse.urlunparse((
                    parsed_abs.scheme, parsed_abs.netloc, parsed_abs.path, '', '', ''
                ))
                # Skip common non-html resources
                if not re.search(r"\.(pdf|jpg|jpeg|png|gif|zip|xml|css|js|mp4|mp3|svg)$", cleaned_url.lower()):
                    links.add(cleaned_url)
        return links

    async def scrape_site(self, start_url: str) -> str:
        """Crawls up to max_pages belonging to the same domain and returns consolidated text."""
        if not start_url.startswith(("http://", "https://")):
            start_url = "https://" + start_url
            
        visited_urls: Set[str] = set()
        to_visit: List[str] = [start_url]
        consolidated_texts: List[str] = []
        
        async with httpx.AsyncClient() as client:
            while to_visit and len(visited_urls) < self.max_pages:
                current_url = to_visit.pop(0)
                if current_url in visited_urls:
                    continue
                    
                visited_urls.add(current_url)
                print(f"[SCRAPER] Indexing: {current_url}")
                
                html = await self.fetch_page(client, current_url)
                if not html:
                    continue
                    
                # Clean and extract text
                clean_text = self.clean_html(html)
                consolidated_texts.append(f"--- SOURCE: {current_url} ---\n{clean_text}\n")
                
                # Extract internal links for further crawling
                new_links = self.extract_links(html, current_url)
                for link in new_links:
                    if link not in visited_urls and link not in to_visit:
                        to_visit.append(link)
                        
        return "\n".join(consolidated_texts)
