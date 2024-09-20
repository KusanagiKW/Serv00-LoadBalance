export default {
  async fetch(request, env, ctx) {
    // 获取服务器列表（每行一个服务器）
    const servers = env.SERVERS.split('\n').map(s => s.trim()).filter(Boolean);
    let lastSuccessfulServer = null;

    // 从环境变量获取最大重试次数和超时，提供默认值
    const MAX_RETRY = parseInt(env.MAX_RETRY, 10) || 2; // 默认最大重试次数为2
    let timeout = parseInt(env.TIMEOUT, 10) || 5000; // 默认超时设置为5秒

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

    // 带缓存的 fetch
    async function fetchWithCache(request, url) {
      const cache = caches.default; // 使用默认缓存
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        return cachedResponse; // 返回缓存结果，避免重复请求
      }

      // 向服务器发出请求
      const response = await fetchWithTimeout(request, url, timeout);

      // 仅在成功时缓存响应
      if (response.ok) {
        ctx.waitUntil(cache.put(request, response.clone())); // 缓存结果
      }

      return response;
    }

    try {
      const ip = request.headers.get('cf-connecting-ip') || 'default-ip';
      const hash = murmurHash3(ip);
      let url = new URL(request.url);
      const initialServerIndex = hash % servers.length;

      // 优先使用上次成功的服务器
      if (lastSuccessfulServer) {
        try {
          url.hostname = lastSuccessfulServer;
          const response = await fetchWithCache(request, url); // 使用带缓存的 fetch
          return response; // 如果上次成功服务器可用，直接返回响应
        } catch (error) {
          console.error('Last successful server failed:', lastSuccessfulServer, error);
        }
      }

      // 如果上次成功服务器不可用，依次轮询其他服务器
      for (let i = 0; i < servers.length && i < MAX_RETRY; i++) {
        const currentServerIndex = (initialServerIndex + i) % servers.length;
        url.hostname = servers[currentServerIndex];

        try {
          const response = await fetchWithCache(request, url); // 使用带缓存的 fetch
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
