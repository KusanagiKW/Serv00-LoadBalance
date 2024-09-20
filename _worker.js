export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
}

let serverIndex = 0; // 记录当前的服务器索引

// 从环境变量获取服务器列表
function getServers(env) {
  return env.SERVERS.split('\n').map(s => s.trim()).filter(Boolean);
}

// 轮询选择服务器
function getNextServer(servers) {
  serverIndex = (serverIndex + 1) % servers.length; // 每次调用后索引递增
  return servers[serverIndex];
}

async function handleRequest(request, env) {
  const servers = getServers(env); // 获取服务器列表

  if (servers.length === 0) {
    return new Response('No servers configured', { status: 500 }); // 服务器列表为空时返回错误
  }

  let url = new URL(request.url);
  url.hostname = getNextServer(servers); // 使用轮询选择服务器

  // 克隆请求，保留 body，避免多次读取 body
  let newRequest = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.clone().body, // 克隆原始请求 body
    redirect: request.redirect
  });

  // 直接返回转发请求的结果
  return fetch(newRequest);
}
