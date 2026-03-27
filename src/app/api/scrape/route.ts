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

    const oxylabsUsername = process.env.OXYLABS_USERNAME;
    const oxylabsPassword = process.env.OXYLABS_PASSWORD;
    if (!oxylabsUsername || !oxylabsPassword) {
      return NextResponse.json({ error: 'OXYLABS credentials not configured in .env.local' }, { status: 500 });
    }

    const oxylabsAuthHeader = 'Basic ' + Buffer.from(`${oxylabsUsername}:${oxylabsPassword}`).toString('base64');

    const results = await Promise.all(items.map(async (inputItem: any) => {
      let targetUrl = inputItem.url;
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      try {
        console.log(`Fetching data from Oxylabs for ${targetUrl}...`);
        
        // If it's an amazon URL, we can use source: 'amazon' (or 'universal') and pass the URL directly
        const isAmazon = targetUrl.toLowerCase().includes('amazon.');
        
        // Oxylabs expects 'url' parameter for direct URL scraping
        let oxylabsBody: any = {
          source: isAmazon ? 'amazon' : 'universal',
          url: targetUrl,
          parse: true
        };

        const oxylabsRes = await fetch('https://realtime.oxylabs.io/v1/queries', {
          method: 'POST',
          headers: {
            'Authorization': oxylabsAuthHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(oxylabsBody),
          // Abort timeout: Oxylabs real-time queries might take up to 25s for residential proxies
          signal: AbortSignal.timeout(25000)
        });
        
        if (!oxylabsRes.ok) {
          const rawErr = await oxylabsRes.text();
          throw new Error(`Oxylabs fetch failed with status ${oxylabsRes.status}: ${rawErr}`);
        }
        
        const oxylabsData = await oxylabsRes.json();
        
        let rawContent = oxylabsData?.results?.[0]?.content || oxylabsData?.results || oxylabsData;
        let scrapedContent = '';
        let extractedImages = new Set<string>();
        let pageTitle = '';

        if (typeof rawContent === 'string' && (rawContent.trim().toLowerCase().startsWith('<!doctype html') || rawContent.trim().toLowerCase().startsWith('<html'))) {
            // It's raw HTML, parse it carefully to keep DeepSeek's context clean and focused on product data
            const $ = cheerio.load(rawContent);
            pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
            const ppdNode = $('#ppd');
            const contextNode = ppdNode.length > 0 ? ppdNode : $('body');
            
            const ogImage = $('meta[property="og:image"]').attr('content');
            if (ogImage) extractedImages.add(ogImage);

            contextNode.find('img').each((_, el) => {
               const src = $(el).attr('src');
               const dataSrc = $(el).attr('data-old-hires') || $(el).attr('data-src') || $(el).attr('data-a-dynamic-image');
               if (dataSrc && dataSrc.startsWith('{')) {
                   try {
                     const parsed = JSON.parse(dataSrc);
                     Object.keys(parsed).forEach(k => extractedImages.add(k));
                   } catch(e) {}
               } else {
                 const finalSrc = dataSrc || src;
                 if (finalSrc && finalSrc.startsWith('http') && !finalSrc.includes('sprite') && !finalSrc.includes('1x1.gif')) {
                    extractedImages.add(finalSrc);
                 }
               }
            });

            contextNode.find('script, style, noscript, svg, path, nav, footer, iframe').remove();
            let pageText = contextNode.text().replace(/\s+/g, ' ').substring(0, 12000);
            
            scrapedContent = `Page Title: ${pageTitle}\n\nImages Found:\n${Array.from(extractedImages).slice(0, 25).join('\n')}\n\nPage Text:\n${pageText}`;
        } else {
            // It's structured JSON
            let stringified = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
            scrapedContent = stringified.substring(0, 15000);
        }

        const systemPrompt = `You are a strict data extraction AI. Given the following URL and Scraped Data (from Oxylabs), extract exactly the product title, product description, exactly 2 prominent high-quality product image URLs from the list provided (or empty string if none), and the exact price. Output ONLY valid JSON with keys: "title", "description", "image1", "image2", "price". Do not wrap in markdown tags. If a field cannot be found, use "N/A". CRITICALLY: If the "description" cannot be found in the text, you MUST generate a high-quality product description yourself using the product title instead of returning "N/A".`;
        
        const userPrompt = `URL: ${targetUrl}\n\nScraped Data:\n${scrapedContent}`;

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
          title: extracted.title || 'Unknown Title',
          description: extracted.description || '',
          image1: extracted.image1 || '',
          image2: extracted.image2 || '',
          price: extracted.price || 'N/A',
          quantity: inputItem.quantity
        };

      } catch (err: any) {
        console.error("Scraping extraction failed for", targetUrl, err);
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
