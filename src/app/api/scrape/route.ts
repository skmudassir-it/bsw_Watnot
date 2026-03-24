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

    // We can process all URLs in a single Apify run to be efficient
    const urls = items.map((item: any) => {
      let targetUrl = item.url;
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }
      return { url: targetUrl };
    });

    const input = {
      categoryUrl: "",
      keyword: "",
      maxItemsPerStartUrl: 1,
      proxyConfiguration: {
        useApifyProxy: true
      },
      useCaptchaSolver: false,
      country: "US",
      urls: urls
    };

    console.log("Starting Apify amazon-scraper...");
    const run = await client.actor('curious_coder/amazon-scraper').call(input);

    const datasetItems = (await client.dataset(run.defaultDatasetId).listItems()).items as any[];

    // Map the results back to our requested format
    const results = await Promise.all(items.map(async (inputItem: any) => {
      const scrapedData = datasetItems.find((d: any) => d.inputUrl === inputItem.url || d.url === inputItem.url);

      if (!scrapedData) {
        return {
          title: 'Not Found / Error',
          description: 'Could not extract data for this URL with amazon-scraper.',
          image1: '',
          price: 'N/A',
          quantity: inputItem.quantity
        };
      }

      // Safe extraction based on typical Apify Amazon scraper outputs
      const title = scrapedData.title || '';
      
      let description = '';
      if (Array.isArray(scrapedData.features) && scrapedData.features.length > 0) {
        description = scrapedData.features.join(' | ');
      } else if (typeof scrapedData.productDescription === 'string' && scrapedData.productDescription) {
        description = scrapedData.productDescription;
      } else if (typeof scrapedData.aboutThisItem === 'string' && scrapedData.aboutThisItem) {
        description = scrapedData.aboutThisItem;
      } else if (typeof scrapedData.description === 'string' && scrapedData.description) {
        description = scrapedData.description;
      } else if (scrapedData.description) {
        description = JSON.stringify(scrapedData.description);
      }

      // Images usually come in an array
      const images: string[] = scrapedData.images || [];
      let image1 = images[0] || scrapedData.thumbnail || scrapedData.image || '';

      // Price can be in various formats
      let priceStr = 'N/A';
      if (scrapedData.price) {
        if (typeof scrapedData.price === 'object') {
          priceStr = scrapedData.price.value || scrapedData.price.raw || JSON.stringify(scrapedData.price);
        } else {
          priceStr = String(scrapedData.price);
        }
      }

      // Hybrid Fallback: Amazon-scraper often lacks image/price. Direct fetch to snag og:image
      if (!image1 || priceStr === 'N/A') {
         try {
           const res = await fetch(inputItem.url, {
             headers: {
               'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
               'Accept': 'text/html'
             },
             signal: AbortSignal.timeout(6000)
           });
           const html = await res.text();
           
           if (!image1) {
             const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/"large":"([^"]+)"/);
             if (imgMatch) image1 = imgMatch[1];
           }
           if (priceStr === 'N/A') {
             const priceMatch = html.match(/<span\s+class="a-price-whole">([^<]+)<\/span>/i) || html.match(/\$(\d+\.\d{2})/);
             if (priceMatch) priceStr = '$' + priceMatch[1].replace('.', '');
           }
         } catch (e) {
           console.log("Fallback fetch failed for", inputItem.url);
         }
      }

      return {
        title: title.substring(0, 100),
        description: description.substring(0, 200),
        image1,
        price: priceStr,
        quantity: inputItem.quantity
      };
    }));

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: String(err), stack: err.stack || '' }, { status: 500 });
  }
}
