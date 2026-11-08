# AI开仓与交易所止盈止损

AI新开多仓/空仓使用相同流程：开仓前刷新持仓、拒绝同合约已有仓位；预先读取价格过滤规则并按tickSize规范止盈止损，按规范后的价格校验入场盈亏比。市场单要求RESULT响应，记录实际成交数量与均价，成交后先设置止损，再设置止盈。

币安保护单使用 `POST /fapi/v1/algoOrder`，`algoType=CONDITIONAL`、`STOP_MARKET`/`TAKE_PROFIT_MARKET`、`workingType=MARK_PRICE`、对应平仓方向以及 `closePosition=true`。不同时提交quantity或reduceOnly。LONG保护单是SELL，SHORT保护单是BUY，沿用项目Hedge持仓模式。

每个保护单有唯一 `clientAlgoId`，创建后通过 `GET /fapi/v1/algoOrder` 回查核对ID、合约、方向、类型、触发价、关闭整个仓位及NEW状态。提交超时也先按同一个ID回查，不能盲目重复提交；回查无法确认视为失败。旧止损/止盈迁移到了Algo接口，因此撤销及平仓清理也覆盖应用自建条件单，按glp-前缀区分手工条件单。

任一保护单未确认时，立即尝试按本次实际成交数量平掉新仓，并在本次交易员实例中禁止后续新开仓；不阻止平仓或其他持仓管理。只有完整平仓成交才记录撤回完成。平仓失败时明确记录严重错误及“平仓未确认”。需要人工核对仓位和保护委托、处理异常后重新加载交易员；重新加载会清除这一实例内的开仓暂停标记，并不代表交易所异常自动消失。

决策动作记录新增止损价、止盈价和保护状态，前端据此展示同步确认/已撤回/平仓未确认。状态接口暴露 `entry_protection_blocked`，页面出现错误提示。原有历史记录缺少这些字段时展示横线，不推断旧订单受保护。

币安市场开仓和两个条件单是独立请求，并非原子事务，存在成交至保护确认的时间窗口；网络故障也可能同时影响补挂及紧急平仓。止损触发不保证成交价等于触发价。此变更不为既有手工仓位自动推算或补挂价格。

官方接口说明：https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/trade

验证：`go test ./trader ./logger ./api ./decision` 及前端构建。保护测试使用模拟交易所，覆盖请求签名、数量参数互斥、tickSize、提交状态不明后的回查、已取消单拒绝、先止损后止盈、失败后的新仓平仓以及暂停新增仓位。未为验证功能主动发送实盘测试订单。
