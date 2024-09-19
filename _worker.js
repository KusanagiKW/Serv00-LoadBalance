export default {
  async fetch(request, env, ctx) {
    const servers = [
      's4argo.slay.us.kg',
      's8argo.slay.us.kg',
      's9argo.slay.us.kg',
      's10argo.slay.us.kg',
      's11argo.slay.us.kg',
      's12argo.slay.us.kg'
    ];

    function murmurHash3(key) {
      let h = 0xdeadbeef;
      for (let i = 0; i < key.length; i++) {
        h = Math.imul(h ^ key.charCodeAt(i), 2654435761);
      }
      return (h ^ (h >>> 16)) >>> 0;
    }

    function getServerIndex(ip) {
      const hash = murmurHash3(ip);
      return hash % servers.length;
    }

    try {
      const ip = request.headers.get('cf-connecting-ip') || 'default-ip';
      let url = new URL(request.url);
      url.hostname = servers[getServerIndex(ip)];

      let newRequest = new Request(url, request);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(newRequest, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      for (let i = 1; i < servers.length; i++) {
        const nextServerIndex = (getServerIndex(ip) + i) % servers.length;
        url.hostname = servers[nextServerIndex];
        try {
          let newRequest = new Request(url, request);
          return await fetch(newRequest);
        } catch (error) {
          console.error('Retry failed for server:', servers[nextServerIndex], error);
        }
      }
      return new Response('All servers are unavailable', { status: 500 });
    }
  }
};
