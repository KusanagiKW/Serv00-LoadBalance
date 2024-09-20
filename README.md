仅供测试！！！仅供测试！！！仅供测试！！！

# Cloudflare Workers 负载均衡器

该项目通过 Cloudflare Workers 实现简单的服务器负载均衡，采用轮询算法分配流量到不同的服务器节点。

# 使用说明

使用Workers/Pages连接Github 的方法部署均可；绑定自定义域后，使用这个自定义域代替伪装域名和SNI

## 功能

- **负载均衡**：基于轮询方式来选择服务器，不依赖 IP 哈希。

## 配置

1. **环境变量**：

   - SERVERS：必填，域名列表，每行一个地址。例如：
     ```
     s4argo.google.com
     s5argo.google.com
     s6argo.google.com
     ```


## 使用

将此 Workers 部署到你的 Cloudflare 账户中，并将你的域名或子域名配置为使用该 Workers 脚本。所有到达 Workers 的请求将通过负载均衡器进行处理和转发。

## 许可

本项目采用 [MIT 许可](LICENSE)，你可以自由使用、修改和分发。
