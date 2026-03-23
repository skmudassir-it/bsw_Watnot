import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  try {
    const { items } = await req.json();
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const results = await Promise.all(
      items.map(async (item: { url: string; quantity: number | string }) => {
        try {
          // Add protocol if missing
          let targetUrl = item.url;
          if (!/^https?:\/\//i.test(targetUrl)) {
            targetUrl = 'https://' + targetUrl;
          }

          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(10000)
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const html = await response.text();
          const $ = cheerio.load(html);

          const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
          const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
          
          const images: string[] = [];
          const ogImage = $('meta[property="og:image"]').attr('content');
          if (ogImage) images.push(ogImage);
          
          $('img').each((i, el) => {
            if (images.length >= 3) return false;
            const src = $(el).attr('src');
            if (src && src.startsWith('http') && !images.includes(src)) {
              images.push(src);
            }
          });

          // Extract basic price from meta tags or common elements
          let price = $('meta[property="product:price:amount"]').attr('content') || 
                      $('meta[property="og:price:amount"]').attr('content');
          
          if (!price) {
            // Very naive fallback
            const bodyText = $('body').text();
            const priceMatch = bodyText.match(/\$\d+(\.\d{2})?/);
            if (priceMatch) {
              price = priceMatch[0];
            } else {
              price = 'N/A';
            }
          } else {
            price = '$' + price;
          }

          return {
            title: title.trim().substring(0, 100),
            description: description.trim().substring(0, 200),
            image1: images[0] || '',
            image2: images[1] || '',
            image3: images[2] || '',
            price: price.trim(),
            quantity: item.quantity
          };
        } catch (error) {
          console.error(`Failed to fetch ${item.url}:`, error);
          return {
             title: 'Error loading URL',
             description: 'Could not fetch data for this property',
             image1: '',
             image2: '',
             image3: '',
             price: 'N/A',
             quantity: item.quantity
          };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
