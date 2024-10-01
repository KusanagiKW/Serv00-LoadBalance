export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
}

let cachedServers = null; // 用于缓存服务器列表
let serverIndex = 0; // 记录当前的服务器索引

// 获取并缓存服务器列表
function getServers(env) {
  if (!cachedServers) {
    cachedServers = env.SERVERS.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return cachedServers;
}

// 轮询选择服务器
function getNextServer(servers) {
  serverIndex = (serverIndex + 1) % servers.length; // 每次调用后索引递增
  return servers[serverIndex];
}

// 检查服务器是否可以成功访问 ChatGPT
async function canAccessChatGPT(server) {
  const testUrl = `https://${server}/v1/chat/completions`; // 使用 ChatGPT API 端点进行测试
  try {
    const response = await fetch(testUrl, { method: 'GET', cf: { cacheEverything: true } });
    return response.ok; // 如果返回状态码 200 或其他成功状态码
  } catch (error) {
    console.error(`Failed to access ChatGPT via ${server}:`, error);
    return false; // 请求失败则返回 false
  }
}

// 并行模式：对所有服务器发起请求，返回第一个成功的响应
async function fetchInParallel(request, servers) {
  const promises = servers.map(async server => {
    let canAccess = true; // 默认可以访问

    // 仅当目标 URL 包含 ChatGPT 时检查服务器可用性
    if (request.url.includes("chatgpt.com")) {
      canAccess = await canAccessChatGPT(server); // 检查服务器是否可以访问 ChatGPT
    }

    if (canAccess) {
      let url = new URL(request.url);
      url.hostname = server;

      // 克隆请求，保留 body，避免多次读取 body
      let newRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.clone().body,
        redirect: request.redirect
      });

      // 发出请求，并捕获失败的情况
      return fetch(newRequest).catch(err => {
        console.error(`Server ${server} failed:`, err);
        return null; // 如果请求失败，返回 null
      });
    }
    return null; // 如果不能访问 ChatGPT，返回 null
  });

  // 使用 Promise.any() 并行请求，选择第一个成功响应的结果
  return Promise.any(promises);
}

// 处理请求
async function handleRequest(request, env) {
  const servers = getServers(env); // 获取缓存的服务器列表

  if (servers.length === 0) {
    return new Response('No servers configured', { status: 500 }); // 如果服务器列表为空，返回错误
  }

  // 检查模式环境变量，选择轮询还是并行模式
  const mode = parseInt(env.MODE, 10); // 从环境变量获取模式

  if (mode === 1) {
    // 轮询模式
    let validServer = null;

    // 查找可以访问 ChatGPT 的服务器（仅在请求 URL 为 ChatGPT 时）
    if (request.url.includes("chatgpt.com")) {
      for (const server of servers) {
        if (await canAccessChatGPT(server)) {
          validServer = server; // 找到可用的服务器
          break;
        }
      }
    } else {
      // 如果不是访问 ChatGPT，直接使用轮询选择的服务器
      validServer = getNextServer(servers);
    }

    if (!validServer) {
      return new Response('No valid server to access ChatGPT', { status: 502 }); // 如果没有可用的服务器，返回502
    }

    let url = new URL(request.url);
    url.hostname = validServer; // 使用可用服务器

    // 克隆请求，保留 body，避免多次读取 body
    let newRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.clone().body,
      redirect: request.redirect
    });

    // 返回轮询请求的结果
    return fetch(newRequest);
  } else if (mode === 2) {
    // 并行模式
    const response = await fetchInParallel(request, servers);
    if (response) {
      return response; // 返回第一个成功的响应
    }

    return new Response('All servers failed to access ChatGPT', { status: 502 }); // 如果所有服务器都失败，返回502错误
  } else {
    return new Response('Invalid mode configuration', { status: 400 }); // 如果环境变量设置无效，返回400错误
  }
}
