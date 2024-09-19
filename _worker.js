export default {
  async fetch(request, env, ctx) {
    // 获取服务器列表（每行一个服务器）
    const servers = env.SERVERS.split('\n').map(s => s.trim()).filter(Boolean);
    let lastSuccessfulServer = null; // 用于存储上次成功的服务器

    function murmurHash3(key) {
      let h = 0xdeadbeef;
      for (let i = 0; i < key.length; i++) {
        h = Math.imul(h ^ key.charCodeAt(i), 2654435761);
      }
      return (h ^ (h >>> 16)) >>> 0;
    }

    // 带超时控制的 fetch
    async function fetchWithTimeout(request, url, timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(new Request(url, request), { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }

    try {
      const ip = request.headers.get('cf-connecting-ip') || 'default-ip';
      const hash = murmurHash3(ip);
      let url = new URL(request.url);
      const initialServerIndex = hash % servers.length;
      let timeout = 5000; // 初始超时为5秒

      // 优先使用上次成功的服务器
      if (lastSuccessfulServer) {
        try {
          url.hostname = lastSuccessfulServer;
          const response = await fetchWithTimeout(request, url, timeout);
          return response; // 如果上次成功服务器可用，直接返回响应
        } catch (error) {
          console.error('Last successful server failed:', lastSuccessfulServer, error);
        }
      }

      // 如果上次成功服务器不可用，依次轮询其他服务器
      for (let i = 0; i < servers.length; i++) {
        const currentServerIndex = (initialServerIndex + i) % servers.length;
        url.hostname = servers[currentServerIndex];

        try {
          const response = await fetchWithTimeout(request, url, timeout);
          lastSuccessfulServer = servers[currentServerIndex]; // 更新上次成功服务器
          return response; // 返回成功的响应
        } catch (error) {
          console.error('Server failed:', servers[currentServerIndex], error);
          timeout *= 2; // 每次失败后增加超时（指数退避策略）
        }
      }

      // 所有服务器都不可用时返回错误
      return new Response('All servers are unavailable', { status: 500 });
    } catch (error) {
      return new Response('Error occurred during request', { status: 500 });
    }
  }
};
