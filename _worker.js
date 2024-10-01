export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
}

// 记录当前的服务器索引
let serverIndex = 0;

// 每次从环境变量获取服务器列表
function getServers(env) {
  return env.SERVERS.split('\n').map(s => s.trim()).filter(Boolean);
}

// 轮询选择服务器
function getNextServer(servers) {
  serverIndex = (serverIndex + 1) % servers.length; // 每次调用后索引递增
  return servers[serverIndex];
}

// 并行模式：对所有服务器发起请求，返回第一个成功的响应
async function fetchInParallel(request, servers) {
  const promises = servers.map(server => {
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
  });

  // 使用 Promise.any() 并行请求，选择第一个成功响应的结果
  return Promise.any(promises);
}

// 处理请求
async function handleRequest(request, env) {
  const servers = getServers(env); // 每次从环境变量获取服务器列表

  if (servers.length === 0) {
    return new Response('No servers configured', { status: 500 }); // 如果服务器列表为空，返回错误
  }

  // 检查模式环境变量，选择轮询还是并行模式
  const mode = parseInt(env.MODE, 10); // 从环境变量获取模式

  if (mode === 1) {
    // 轮询模式
    let url = new URL(request.url);
    url.hostname = getNextServer(servers); // 使用轮询选择服务器

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

    return new Response('All servers failed', { status: 502 }); // 如果所有服务器都失败，返回 502 错误
  } else {
    return new Response('Invalid mode configuration', { status: 400 }); // 如果环境变量设置无效，返回 400 错误
  }
}
