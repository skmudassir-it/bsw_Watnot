import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  try {
    const { items } = await req.json();
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      return NextResponse.json({ error: 'DEEPSEEK_API_KEY not configured in .env.local' }, { status: 500 });
    }

    const results = await Promise.all(items.map(async (inputItem: any) => {
      let targetUrl = inputItem.url;
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      try {
        console.log(`Fetching HTML for ${targetUrl}...`);
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(8000)
        });
        
        if (!res.ok) {
          throw new Error(`HTTP fetch failed with status ${res.status}`);
        }
        
        const html = await res.text();
        const $ = cheerio.load(html);

        const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
        
        // Extract all image sources prioritizing data attributes used for lazy loading
        const allImages = new Set<string>();
        const ogImage = $('meta[property="og:image"]').attr('content');
        if (ogImage) allImages.add(ogImage);

        $('img').each((_, el) => {
           const src = $(el).attr('src');
           const dataSrc = $(el).attr('data-old-hires') || $(el).attr('data-src') || $(el).attr('data-a-dynamic-image');
           
           // Extract from Amazon dynamic images obj
           if (dataSrc && dataSrc.startsWith('{')) {
               try {
                 const parsed = JSON.parse(dataSrc);
                 Object.keys(parsed).forEach(k => allImages.add(k));
               } catch(e) {}
           } else {
             const finalSrc = dataSrc || src;
             if (finalSrc && finalSrc.startsWith('http') && !finalSrc.includes('sprite') && !finalSrc.includes('1x1.gif')) {
                allImages.add(finalSrc);
             }
           }
        });

        // Strip non-visual formatting
        $('script, style, noscript, svg, path, nav, footer, iframe').remove();
        let pageText = $('body').text().replace(/\s+/g, ' ').substring(0, 12000);

        const systemPrompt = `You are a strict data extraction AI. Given the following URL, Page Title, Page Text, and List of Images, extract exactly the product title, product description, exactly 2 prominent high-quality product image URLs from the list provided (or empty string if none), and the exact price. Output ONLY valid JSON with keys: "title", "description", "image1", "image2", "price". Do not wrap in markdown tags. If a field cannot be found, use "N/A".`;
        
        const userPrompt = `URL: ${targetUrl}\nTitle: ${pageTitle}\n\nImages Found:\n${Array.from(allImages).slice(0, 25).join('\n')}\n\nPage Text:\n${pageText}`;

        console.log(`Calling DeepSeek API for ${targetUrl}...`);
        const llmRes = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${deepseekApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
          })
        });

        if (!llmRes.ok) {
          const errText = await llmRes.text();
          throw new Error(`DeepSeek API Error: ${errText}`);
        }

        const llmData = await llmRes.json();
        const extracted = JSON.parse(llmData.choices[0].message.content);

        return {
          title: extracted.title || pageTitle.substring(0, 100),
          description: extracted.description || '',
          image1: extracted.image1 || '',
          image2: extracted.image2 || '',
          price: extracted.price || 'N/A',
          quantity: inputItem.quantity
        };

      } catch (err: any) {
        console.error("Scrape/Groq extraction failed for", targetUrl, err);
        return {
          title: 'Error',
          description: String(err.message || err),
          image1: '',
          image2: '',
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
