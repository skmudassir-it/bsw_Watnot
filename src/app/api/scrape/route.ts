import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';

export async function POST(req: Request) {
  try {
    const { items } = await req.json();
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN as string,
    });

    const results = await Promise.all(items.map(async (inputItem: any) => {
      let targetUrl = inputItem.url;
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      // Extract ASIN or search keyword from URL
      const asinMatch = targetUrl.match(/(?:\/dp\/|\/gp\/product\/|\/asin\/|\/([A-Z0-9]{10})(?:[/?]|$))/i);
      let searchQuery = targetUrl;
      if (asinMatch && asinMatch[1]) {
        searchQuery = asinMatch[1];
      } else if (asinMatch && asinMatch[0]) {
        searchQuery = asinMatch[0].replace(/[^A-Z0-9]/gi, '');
      }

      console.log(`Starting sovereigntaylor driver for query: ${searchQuery}`);

      try {
        const run = await client.actor('sovereigntaylor/amazon-product-scraper').call({
          searchQuery: searchQuery,
          maxProducts: 1,
          proxyConfiguration: { useApifyProxy: true },
          marketplace: "amazon.com"
        });

        const dataset = await client.dataset(run.defaultDatasetId).listItems();
        const scrapedData = dataset.items[0] as any;

        if (!scrapedData) {
          return {
            title: 'Not Found / Error',
            description: 'Could not locate product using this actor.',
            image1: '',
            price: 'N/A',
            quantity: inputItem.quantity
          };
        }

        const title = scrapedData.title || '';
        const image1 = scrapedData.imageUrl || '';
        const description = scrapedData.brand ? `Brand: ${scrapedData.brand}` : '';

        let priceStr = 'N/A';
        if (scrapedData.priceRaw) {
          priceStr = String(scrapedData.priceRaw);
        } else if (scrapedData.price) {
          priceStr = String(scrapedData.price);
        }

        // Direct fetch fallback for missing fields if needed
        let finalImage = image1;
        let finalPrice = priceStr;

        if (!finalImage || finalPrice === 'N/A') {
          try {
            const res = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
              },
              signal: AbortSignal.timeout(6000)
            });
            const html = await res.text();
            
            if (!finalImage) {
              const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/"large":"([^"]+)"/);
              if (imgMatch) finalImage = imgMatch[1];
            }
            if (finalPrice === 'N/A') {
              const priceMatch = html.match(/<span\s+class="a-price-whole">([^<]+)<\/span>/i) || html.match(/\$(\d+\.\d{2})/);
              if (priceMatch) finalPrice = '$' + priceMatch[1].replace('.', '');
            }
          } catch (e) {
            console.log("Fallback fetch failed for", targetUrl);
          }
        }

        return {
          title: title.substring(0, 100),
          description: description.substring(0, 200),
          image1: finalImage,
          price: finalPrice,
          quantity: inputItem.quantity
        };

      } catch (err) {
        console.error("Actor run failed for", targetUrl, err);
        return {
          title: 'Error',
          description: 'Actor run failed.',
          image1: '',
          price: 'N/A',
          quantity: inputItem.quantity
        };
      }
    }));

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: String(err), stack: err.stack || '' }, { status: 500 });
  }
}
