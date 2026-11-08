# 币安实时持仓

持仓页面使用后端转发的推送，独立于 AI 决策间隔和交易员的运行状态。

- `GET /api/traders/:id/positions/stream` 使用带 Authorization 请求头的 SSE；先验证登录身份及交易员归属，持续检查登录有效期。API 密钥和 listenKey 不发送给浏览器。
- 每个交易员的多个浏览器页面共享上游连接，最后一个页面离开时取消连接；删除交易员也会结束推送。停止自动交易不影响查看持仓。
- 行情连接为 `wss://fstream.binance.com/market/ws/!markPrice@arr@1s`。只接受有效且及时的 UM 标记价，按持仓方向、数量和入场价估算浮盈；拒绝旧价格、非有限数值和 CM 行情。
- 账户连接为 `wss://fstream.binance.com/private/ws/<listenKey>`；每 30 分钟续期，过期或断线重建。账户事件按增量处理，区分 LONG、SHORT 和 BOTH；不会把一次局部更新当成全部持仓。
- 连接账户推送后先获取完整持仓快照，此后每 30 秒及持仓/保证金/杠杆变更时从 REST 校准。若请求期间收到更新的账户事件，丢弃旧快照并重新获取。新开仓缺少杠杆等完整字段时等待快照补齐；强平价变更期间显示缺失，不自行推算。
- 两条连接及快照均正常且持仓标记价在 5 秒内才显示“实时”；连接异常或快照过期会降级。SSE 心跳每秒发送，但数据时间只随真实更新变化。浏览器无消息 15 秒后重连，离开页面/切换交易员/退出登录会取消旧请求。
- 前端持仓 REST 每5秒轮询，后端持仓缓存最长5秒，前端去重1秒。标记价和未实现盈亏金额直接取自币安账户快照，不使用SSE估算值覆盖；显示账户快照时间，推送心跳不会刷新金额的新鲜度。SSE仍用于及时移除已平仓记录，新仓和数量变化等待账户快照确认。移除本地估算收益率，避免与币安ROI口径混淆。
- 后端暂时未就绪返回 404 时，前端会退避重试，不会永久停订阅；401/403 明确提示登录或访问权限问题。空持仓统一返回 `[]`。
- 持仓快照读取采用 8 秒超时，失败后按 2–30 秒退避重试，并显示安全处理后的具体原因。账户读取之间不持有共享网络锁，时间同步也不在客户端互斥锁内等待。数据没有确认成功或已过期时，不显示“当前暂无持仓”作为最新状态。
- 持仓存在性按 `positions_at` 和 REST 的 `X-Positions-As-Of` 时间选择，行情时间不能把旧持仓当成新持仓。账户事件使旧缓存失效，失效前发起的 HTTP 请求不能重新填充旧缓存；延迟响应和断线切换都不能覆盖更新的平仓结果。

注意：标记价推送中小写 `p` 是标记价，大写 `P` 是预估结算价；Go JSON 解码必须同时声明两个字段，避免大小写不敏感匹配导致覆盖。源码已有回归测试，但旧运行二进制仍可能保留错误；前端以账户快照为准可避免这一估算错误影响显示。

此链路不提交订单、不自动启动交易员，不把浮盈估算写回交易账户数据；账户事件会使旧缓存失效，下次读取重新获取交易所数据。币安访问地区或 API 权限限制会影响账户订阅与校准，推送不能解除这些限制。

验证：`go test -race ./trader -run TestPosition`、`go test ./api -run TestPositionStream`、前端 `usePositionStream` 与 `TradingDashboard` 测试。使用本地模拟 WebSocket/REST 测试推送、双向持仓、乱序、快照竞态、重连、共享连接和身份隔离。

参考：[币安 WebSocket 地址升级公告](https://www.binance.com/zh-CN/support/announcement/detail/ebf9b0aa9eca4ff3804eef6fb09ba32a)、[标记价推送](https://developers.binance.info/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/market)、[用户数据流](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/user-data-streams)。
