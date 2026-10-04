export async function GET(request: Request) {
 const candidate = new URL(request.url).searchParams.get('start') ?? '/commercial';
 const start = /^\/c\/[a-f0-9]{64}$/.test(candidate) ? candidate : '/commercial';
 return Response.json({ id: start, name: 'GetCan', short_name: 'GetCan', description: 'Water orders, deliveries and collections', start_url: start, scope: '/', display: 'standalone', background_color: '#f1f8fb', theme_color: '#087b91', icons: [192,512].map(size => ({ src: `/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })) }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } });
}
