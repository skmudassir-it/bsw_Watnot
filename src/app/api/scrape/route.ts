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
    const results = items.map((inputItem: any) => {
      const scrapedData = datasetItems.find((d: any) => d.inputUrl === inputItem.url || d.url === inputItem.url);

      if (!scrapedData) {
        return {
          title: 'Not Found / Error',
          description: 'Could not extract data for this URL with amazon-scraper.',
          image1: '',
          image2: '',
          image3: '',
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
      const image1 = images[0] || scrapedData.thumbnail || scrapedData.image || '';

      // Price can be in various formats
      let priceStr = 'N/A';
      if (scrapedData.price) {
        if (typeof scrapedData.price === 'object') {
          priceStr = scrapedData.price.value || scrapedData.price.raw || JSON.stringify(scrapedData.price);
        } else {
          priceStr = String(scrapedData.price);
        }
      }

      return {
        title: title.substring(0, 100),
        description: description.substring(0, 200),
        image1,
        price: priceStr,
        quantity: inputItem.quantity
      };
    });

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: String(err), stack: err.stack || '' }, { status: 500 });
  }
}
