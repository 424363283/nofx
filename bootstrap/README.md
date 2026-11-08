# Bootstrap 模块初始化框架

## 概述

Bootstrap 是一个模块化的初始化框架，允许各个模块通过注册钩子的方式自动完成初始化，支持优先级控制、条件初始化、错误策略等高级特性。

## 核心特性

- ✅ **优先级排序** - 保证模块按正确的顺序初始化
- ✅ **钩子命名** - 每个钩子都有清晰的名称，便于日志追踪和错误定位
- ✅ **上下文传递** - 模块之间可以共享数据（如数据库实例）
- ✅ **条件初始化** - 根据配置动态决定是否初始化某个模块
- ✅ **灵活的错误处理** - 支持快速失败、继续执行、警告三种策略
- ✅ **详细日志** - 显示初始化进度、耗时统计
- ✅ **线程安全** - 使用互斥锁保护全局状态
- ✅ **测试友好** - 提供 Clear() 方法清除钩子

## 快速开始

### 1. 在模块中注册初始化钩子

在你的模块包中创建 `init.go` 文件：

```go
// proxy/init.go
package proxy

import (
	"guanlan/bootstrap"
	"guanlan/config"
)

func init() {
	// 注册初始化钩子
	bootstrap.Register("Proxy模块", bootstrap.PriorityCore, initProxyModule)
}

func initProxyModule(ctx *bootstrap.Context) error {
	// 从配置中读取 proxy 配置
	proxyConfig := ctx.Config.Proxy

	// 初始化代理管理器
	if err := InitGlobalProxyManager(proxyConfig); err != nil {
		return err
	}

	// 将实例存储到上下文，供其他模块使用
	ctx.Set("proxy_manager", GetGlobalProxyManager())

	return nil
}
```

### 2. 在 main.go 中运行初始化

```go
package main

import (
	"log"
	"guanlan/bootstrap"
	"guanlan/config"

	// 导入需要初始化的模块（触发 init() 注册）
	_ "guanlan/proxy"
	_ "guanlan/market"
	_ "guanlan/trader"
)

func main() {
	// 加载配置
	cfg, err := config.LoadConfig("config.json")
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	// 创建初始化上下文
	ctx := bootstrap.NewContext(cfg)

	// 执行所有初始化钩子
	if err := bootstrap.Run(ctx); err != nil {
		log.Fatalf("初始化失败: %v", err)
	}

	// 启动业务逻辑...
}
```

### 3. 运行效果

```
🔄 开始初始化 3 个模块...
  [1/3] 初始化: Database模块 (优先级: 20)
  ✓ 完成: Database模块 (耗时: 120ms)
  [2/3] 初始化: Proxy模块 (优先级: 50)
    ↳ 代理自动刷新已启动 (间隔: 30m0s)
    ↳ 代理池状态: 总计=5, 黑名单=0, 可用=5
  ✓ 完成: Proxy模块 (耗时: 35ms)
  [3/3] 初始化: Market模块 (优先级: 100)
  ✓ 完成: Market模块 (耗时: 200ms)
✅ 所有模块初始化完成 (总耗时: 355ms)
📊 统计: 成功=3, 跳过=0
```

## 优先级常量

系统预定义了以下优先级常量（数值越小越先执行）：

| 常量 | 值 | 用途 | 示例 |
|------|-----|------|------|
| `PriorityInfrastructure` | 10 | 基础设施 | 日志系统、配置加载 |
| `PriorityDatabase` | 20 | 数据库连接 | SQLite、Redis |
| `PriorityCore` | 50 | 核心模块 | Proxy、Market Monitor |
| `PriorityBusiness` | 100 | 业务模块 | Trader、API Server |
| `PriorityBackground` | 200 | 后台任务 | 定时任务、监控 |

### 使用示例

```go
// 数据库模块（最先初始化）
bootstrap.Register("Database", bootstrap.PriorityDatabase, initDatabase)

// 代理模块（核心模块）
bootstrap.Register("Proxy", bootstrap.PriorityCore, initProxy)

// Trader模块（依赖数据库和代理）
bootstrap.Register("Trader", bootstrap.PriorityBusiness, initTrader)
```

## 高级特性

### 1. 条件初始化

某些模块只在特定条件下才需要初始化：

```go
bootstrap.Register("Proxy模块", bootstrap.PriorityCore, initProxy).
	EnabledIf(func(ctx *bootstrap.Context) bool {
		// 只在配置中启用 proxy 时才初始化
		return ctx.Config.Proxy != nil && ctx.Config.Proxy.Enabled
	})
```

**输出**：
```
  [2/5] 跳过: Proxy模块 (条件未满足)
```

### 2. 错误处理策略

支持三种错误处理策略：

#### FailFast（默认）- 遇到错误立即停止

```go
bootstrap.Register("Database", bootstrap.PriorityDatabase, initDatabase)
// 默认就是 FailFast，无需显式设置
```

**效果**：Database 初始化失败，整个系统停止启动

#### ContinueOnError - 继续执行，收集所有错误

```go
bootstrap.Register("Proxy", bootstrap.PriorityCore, initProxy).
	OnError(bootstrap.ContinueOnError)
```

**效果**：Proxy 失败不影响其他模块，最后汇总所有错误

#### WarnOnError - 继续执行，只打印警告

```go
bootstrap.Register("Proxy", bootstrap.PriorityCore, initProxy).
	OnError(bootstrap.WarnOnError)
```

**效果**：Proxy 失败只打印警告，不影响系统运行

**输出**：
```
  [2/5] 初始化: Proxy模块 (优先级: 50)
  ⚠️  警告: Proxy模块 (耗时: 15ms) - 连接代理服务器超时
```

### 3. 上下文数据共享

模块之间可以通过 Context 共享数据：

```go
// database/init.go - 存储数据库实例
func initDatabase(ctx *bootstrap.Context) error {
	db, err := sql.Open("sqlite", "config.db")
	if err != nil {
		return err
	}

	// 存储到上下文
	ctx.Set("database", db)
	return nil
}

// trader/init.go - 获取数据库实例
func initTrader(ctx *bootstrap.Context) error {
	// 从上下文获取数据库实例
	db, ok := ctx.Get("database")
	if !ok {
		return fmt.Errorf("database 未初始化")
	}

	database := db.(*sql.DB)
	// 使用 database 初始化 trader...
	return nil
}
```

**安全获取**：
```go
// 使用 MustGet，不存在会 panic（适合必需的依赖）
db := ctx.MustGet("database").(*sql.DB)
```

### 4. 链式调用

支持流畅的链式调用：

```go
bootstrap.Register("Proxy", bootstrap.PriorityCore, initProxy).
	EnabledIf(func(ctx *bootstrap.Context) bool {
		return ctx.Config.Proxy != nil && ctx.Config.Proxy.Enabled
	}).
	OnError(bootstrap.WarnOnError)
```

### 5. 自定义错误策略

在 Run 时可以指定全局默认错误策略：

```go
// 所有钩子默认使用 ContinueOnError，除非钩子自己指定了 FailFast
err := bootstrap.RunWithPolicy(ctx, bootstrap.ContinueOnError)
```

## 完整示例

### 示例1：Database 模块

```go
// database/init.go
package database

import (
	"database/sql"
	"guanlan/bootstrap"
)

func init() {
	bootstrap.Register("Database", bootstrap.PriorityDatabase, initDatabase)
}

func initDatabase(ctx *bootstrap.Context) error {
	db, err := sql.Open("sqlite", "config.db")
	if err != nil {
		return err
	}

	// 测试连接
	if err := db.Ping(); err != nil {
		return err
	}

	// 存储到上下文
	ctx.Set("database", db)
	return nil
}
```

### 示例2：Proxy 模块（条件初始化 + 警告策略）

```go
// proxy/init.go
package proxy

import (
	"guanlan/bootstrap"
	"guanlan/config"
)

func init() {
	bootstrap.Register("Proxy", bootstrap.PriorityCore, initProxy).
		EnabledIf(func(ctx *bootstrap.Context) bool {
			return ctx.Config.Proxy != nil && ctx.Config.Proxy.Enabled
		}).
		OnError(bootstrap.WarnOnError) // Proxy 失败不影响系统
}

func initProxy(ctx *bootstrap.Context) error {
	proxyConfig := convertConfig(ctx.Config.Proxy)

	if err := InitGlobalProxyManager(proxyConfig); err != nil {
		return err
	}

	ctx.Set("proxy_manager", GetGlobalProxyManager())
	return nil
}
```

### 示例3：Trader 模块（依赖其他模块）

```go
// trader/init.go
package trader

import (
	"guanlan/bootstrap"
)

func init() {
	bootstrap.Register("Trader", bootstrap.PriorityBusiness, initTrader)
}

func initTrader(ctx *bootstrap.Context) error {
	// 获取依赖
	db := ctx.MustGet("database").(*sql.DB)

	// 可选依赖
	var proxyMgr *proxy.ProxyManager
	if pm, ok := ctx.Get("proxy_manager"); ok {
		proxyMgr = pm.(*proxy.ProxyManager)
	}

	// 使用依赖初始化 trader...
	return nil
}
```

## 调试和测试

### 查看已注册的钩子

```go
hooks := bootstrap.GetRegistered()
for _, hook := range hooks {
	fmt.Printf("钩子: %s, 优先级: %d\n", hook.Name, hook.Priority)
}
```

### 清除钩子（用于测试）

```go
func TestMyModule(t *testing.T) {
	// 清除之前注册的钩子
	bootstrap.Clear()

	// 注册测试钩子
	bootstrap.Register("Test", 10, func(ctx *bootstrap.Context) error {
		return nil
	})

	// 运行测试...
}
```

### 统计钩子数量

```go
count := bootstrap.Count()
fmt.Printf("已注册 %d 个初始化钩子\n", count)
```

## 错误处理最佳实践

### 1. 关键模块使用 FailFast

```go
// 数据库是关键依赖，失败必须停止
bootstrap.Register("Database", bootstrap.PriorityDatabase, initDatabase)
// 默认是 FailFast，无需显式设置
```

### 2. 可选模块使用 WarnOnError

```go
// Proxy 是可选的，失败可以使用直连
bootstrap.Register("Proxy", bootstrap.PriorityCore, initProxy).
	OnError(bootstrap.WarnOnError)
```

### 3. 批量初始化使用 ContinueOnError

```go
// 批量加载插件，希望看到所有失败的插件
for _, plugin := range plugins {
	bootstrap.Register(plugin.Name, 150, plugin.Init).
		OnError(bootstrap.ContinueOnError)
}
```

## 常见问题

### Q1: 如何保证模块A在模块B之前初始化？

使用优先级控制：
```go
bootstrap.Register("ModuleA", 50, initA)  // 先执行
bootstrap.Register("ModuleB", 100, initB) // 后执行
```

### Q2: 如何在初始化失败时获取详细信息？

钩子名称会自动包含在错误信息中：
```
Error: [Proxy模块] 初始化失败: 连接代理服务器超时
```

### Q3: 可以动态注册钩子吗？

可以，但建议在 `init()` 函数中注册：
```go
// 推荐：在 init() 中注册（包加载时自动执行）
func init() {
	bootstrap.Register("MyModule", 100, initModule)
}

// 不推荐：在运行时注册（可能导致顺序问题）
func main() {
	bootstrap.Register("MyModule", 100, initModule)
}
```

### Q4: 如何在钩子中访问命令行参数？

通过 Context 的 Data 字段传递：
```go
// main.go
ctx := bootstrap.NewContext(cfg)
ctx.Set("args", os.Args)

// module/init.go
func initModule(ctx *bootstrap.Context) error {
	args := ctx.MustGet("args").([]string)
	// 使用 args...
}
```
## 性能考虑

- 钩子注册是线程安全的，但注册本身有轻微的锁开销
- 建议在 `init()` 函数中注册，避免运行时动态注册
- 钩子执行是顺序的，不会并发执行
- 每个钩子的耗时会被记录并显示

## 许可证

本模块为 GUANLAN 项目内部模块，遵循项目整体许可证。
