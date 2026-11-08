# Ant Design 界面规范

界面基于 Ant Design 6.7，默认中文、深色背景与翡翠绿主题。`web/src/components/design/DesignProvider.tsx` 是颜色、圆角、字体、控件高度的统一入口。后续组件应优先直接使用 Ant Design，不再新增原生表单控件或独立弹窗实现。

## 覆盖范围

- 导航：Menu、Dropdown、Drawer；桌面横向导航与手机抽屉。
- 登录、注册、重置密码、交易员、模型和交易所配置：Form、Input、InputNumber、Select、Checkbox、Radio、Button、Modal。
- 仪表盘、收益概览、帮助页：Card、Table、Collapse、Tooltip、Alert、message 与确认弹窗。
- 市场雷达：Statistic、Table、Descriptions、Tag、Segmented、Skeleton、Empty；支持表格/卡片、排序、分页、展开详情和美股分类。
- 收益曲线继续由现有 Recharts 渲染，容器及交互控件使用 Ant Design。

## 兼容边界

`Controls.tsx` 将已有表单的原生事件签名转换为 Ant Design 接口，保留保存校验、数字零、选择值与失败后输入。UiTable 将原有持仓/学习记录行转换为 Ant Table。新增页面建议直接传入 Ant Design 的 columns/dataSource。

`design.css` 只负责页面布局与响应式规则。不要用全局 input/button/table 样式覆盖组件主题。页面按路由懒加载，Ant Design 与图表依赖分包。

## 验证

运行 `npm --prefix web run build` 和 `npm --prefix web test -- --run`。测试覆盖合约筛选、美股筛选、信号预览、交易员保存失败、弹窗键盘关闭、表单事件以及雷达缺失数据和网络错误。浏览器检查不提交真实交易配置或订单。

## 交易工作台

/dashboard 使用 TradingDashboard：顶部账户指标条、收益曲线和运行概况、底部全宽标签工作区。持仓、异动候选、决策记录、策略复盘分别显示，避免持仓表挤在半屏和多个长列表同时铺开。TradingDashboard 负责展示，不改变交易 API 或下单逻辑。

收益图表的 compact 属性隐藏重复账户数值与底部统计；横轴按可用空间保留首尾并自动省略中间时间。缺失账户数据使用破折号，零收益保持中性色。手机下指标两列、图表和运行概况纵向排列；宽表格仅在自身容器横向滚动。

## 交易员管理

/traders 使用 TradersManagementView 展示，原 AITradersPage 保留数据加载、配置弹窗和交易操作回调。顶部以创建为主操作，旧版信号配置位于“更多设置”；模型与交易账户使用紧凑摘要；交易员列表提供搜索、运行状态筛选和表格操作。停止状态采用中性色，删除保留在行菜单并沿用原确认流程。资源项使用 Ant Button，支持键盘操作；手机下配置区纵向排列，表格内部横向滚动。

## 实时总览

/competition 采用顶部三项统计、全宽收益走势、全宽排行表。图表固定为 310px，横轴自动避让刻度，零收益线标签放在图内；图例与排行色标共享配色。正负收益与中性零值分别着色，停止状态使用灰色文字，避免误解为错误。保留每 15 秒排行刷新、30 秒历史刷新和前 5 位收益率对比。请求失败明确显示重试状态，不以加载占位无限等待。
